// translator.js — Сервис перевода, очередь запросов, Rate Limiter, кэш и fallback провайдеров

import { LANGUAGES, buildSystemPrompt, detectLanguageHeuristic, isSameLanguage } from "./langs";

const getBunny = () => globalThis.bunny ?? globalThis.vendetta ?? {};

const MAX_CONCURRENT = 3;      // Максимум 3 параллельных запроса
const MAX_PER_SECOND = 5;      // Не чаще 5 запросов в секунду
const REQUEST_TIMEOUT_MS = 6000; // Таймаут 6 секунд
const MAX_CACHE_SIZE = 500;    // Лимит записей в persist-кэше
const TOAST_COOLDOWN_MS = 60000; // Тост об ошибке не чаще 1 раза в минуту

// Кэш в оперативной памяти для мгновенного доступа при ререндере React-компонентов
const memoryCache = new Map();
// Карта активных промисов, чтобы не дублировать запросы для одного и того же текста
const inflightRequests = new Map();

// Состояние очереди и лимитов
let activeCount = 0;
let requestTimestamps = [];
const requestQueue = [];
let queueTimer = null;
let lastErrorToastTime = 0;
let isUnloaded = false;

/**
 * Инициализация кэша из bunny.storage при старте плагина
 */
export function initTranslatorCache() {
  isUnloaded = false;
  const storage = getBunny().storage;
  if (storage && Array.isArray(storage.translationCacheEntries)) {
    for (const [k, v] of storage.translationCacheEntries) {
      memoryCache.set(k, v);
    }
  }
}

/**
 * Сохранение кэша обратно в bunny.storage с отсечением старых записей (LRU на 500 элементов)
 */
function persistCache() {
  const storage = getBunny().storage;
  if (!storage) return;

  if (memoryCache.size > MAX_CACHE_SIZE) {
    const excess = memoryCache.size - MAX_CACHE_SIZE;
    const keys = memoryCache.keys();
    for (let i = 0; i < excess; i++) {
      const oldestKey = keys.next().value;
      if (oldestKey !== undefined) memoryCache.delete(oldestKey);
    }
  }

  try {
    storage.translationCacheEntries = Array.from(memoryCache.entries());
  } catch (e) {
    // Игнорируем возможные ошибки сериализации прокси
  }
}

/**
 * Полная очистка кэша переводов (вызывается из настроек или командой)
 */
export function clearTranslationCache() {
  memoryCache.clear();
  const storage = getBunny().storage;
  if (storage) {
    storage.translationCacheEntries = [];
  }
}

/**
 * Возвращает текущий размер кэша
 */
export function getCacheSize() {
  return memoryCache.size;
}

/**
 * Очистка очереди и таймеров при выгрузке плагина (onUnload)
 */
export function shutdownTranslator() {
  isUnloaded = true;
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  while (requestQueue.length > 0) {
    const item = requestQueue.shift();
    if (item && item.reject) item.reject(new Error("Plugin unloaded"));
  }
  inflightRequests.clear();
}

/**
 * Тихий показ тоста об ошибке не чаще 1 раза в минуту
 */
function notifyTranslationError() {
  const now = Date.now();
  if (now - lastErrorToastTime < TOAST_COOLDOWN_MS) return;
  lastErrorToastTime = now;

  const bunny = getBunny();
  const showToast = bunny?.ui?.toasts?.showToast ?? bunny?.ui?.showToast;
  if (typeof showToast === "function") {
    try {
      showToast("Перевод недоступен");
    } catch (_) {}
  }
}

/**
 * Обёртка над fetch с жёстким таймаутом 6 секунд через AbortController
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller ? controller.signal : undefined
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Планировщик очереди: максимум 3 параллельно, максимум 5 в секунду
 */
function processQueue() {
  if (isUnloaded || requestQueue.length === 0) return;

  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((ts) => now - ts < 1000);

  if (activeCount >= MAX_CONCURRENT) return;

  if (requestTimestamps.length >= MAX_PER_SECOND) {
    if (!queueTimer) {
      const waitMs = Math.max(50, 1000 - (now - requestTimestamps[0]) + 15);
      queueTimer = setTimeout(() => {
        queueTimer = null;
        processQueue();
      }, waitMs);
    }
    return;
  }

  const nextTask = requestQueue.shift();
  if (!nextTask) return;

  activeCount++;
  requestTimestamps.push(Date.now());

  nextTask
    .fn()
    .then(nextTask.resolve)
    .catch(nextTask.reject)
    .finally(() => {
      activeCount = Math.max(0, activeCount - 1);
      processQueue();
    });

  // Если ещё есть слоты, запускаем следующую задачу
  if (activeCount < MAX_CONCURRENT && requestTimestamps.length < MAX_PER_SECOND && requestQueue.length > 0) {
    processQueue();
  }
}

function enqueueRequest(fn) {
  return new Promise((resolve, reject) => {
    if (isUnloaded) return reject(new Error("Unloaded"));
    requestQueue.push({ fn, resolve, reject });
    processQueue();
  });
}

/**
 * Проверка, нужно ли вообще переводить текст сообщения
 * Игнорируем: короче 2 символов, сообщения без букв (только эмодзи/стикеры/ссылки/цифры)
 */
export function shouldTranslateMessage(message, currentUserId, settings) {
  if (!message || typeof message.content !== "string") return false;

  // Системные сообщения Discord (тип 0 — обычное, 19 — ответ/reply)
  if (message.type !== undefined && message.type !== 0 && message.type !== 19) {
    return false;
  }

  // Игнор ботов и вебхуков
  if (message.author?.bot || message.webhookId) return false;

  // Игнор своих сообщений (если тумблер выключен)
  if (!settings.translateOwn && currentUserId && message.author?.id === currentUserId) {
    return false;
  }

  // Очищаем текст от кастомных эмодзи, упоминаний и ссылок для проверки длины и букв
  const stripped = message.content
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<@!?\d+>|<#\d+>|<@&\d+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();

  if (stripped.length < 2) return false;

  // Проверка наличия хотя бы одной буквы любого алфавита (Unicode Property Escapes или универсальный диапазон)
  let hasLetters = false;
  try {
    hasLetters = /\p{L}/u.test(stripped);
  } catch (_) {
    hasLetters = /[a-zA-Z\u00C0-\u024F\u0370-\u1FFF\u3040-\uD7AF]/.test(stripped);
  }

  return hasLetters;
}

/**
 * Провайдер 1: OpenAI / LLM (gpt-4o-mini или совместимый кастомный эндпоинт/прокси)
 */
async function translateViaOpenAI(text, targetLang, styleId, settings) {
  const apiKey = (settings.openaiKey || "").trim();
  const baseUrl = (settings.openaiEndpoint || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = (settings.openaiModel || "gpt-4o-mini").trim();

  // Если используется кастомный Cloudflare Worker прокси без ключа на клиенте, разрешаем пустой ключ
  const isCustomProxy = baseUrl !== "https://api.openai.com/v1";
  if (!apiKey && !isCustomProxy) {
    throw new Error("OpenAI API key missing");
  }

  // Автоопределение исходного языка для футера и проверки совпадения
  const detectedSource = detectLanguageHeuristic(text) || await detectViaGoogle(text);
  if (detectedSource && isSameLanguage(detectedSource, targetLang)) {
    return { skipped: true, sourceLang: detectedSource };
  }

  const systemPrompt = buildSystemPrompt(targetLang, styleId);
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: styleId === "literal" ? 0.1 : 0.4,
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ]
    })
  });

  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}`); }  const data = await res.json(); const translatedText = data?.choices?.[0]?.message?.content?.trim(); if (!translatedText) throw new Error("Empty OpenAI response");  return { text: translatedText, sourceLang: (detectedSource \vert{}\vert{} "auto").toUpperCase(), targetLang, provider: "OpenAI" }; }  /** * Провайдер 2: DeepL API (Free api-free.deepl.com или Pro api.deepl.com) */ async function translateViaDeepL(text, targetLang, styleId, settings) { const apiKey = (settings.deeplKey \vert{}\vert{} "").trim(); if (!apiKey) throw new Error("DeepL API key missing");  const isFreeKey = apiKey.endsWith(":fx"); const endpoint = isFreeKey ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";  // Нормализация кодов языков под стандарт DeepL let deeplTarget = targetLang.toUpperCase(); if (deeplTarget.startsWith("EN-") && deeplTarget !== "EN-US" && deeplTarget !== "EN-GB") { deeplTarget = "EN-US"; } else if (deeplTarget.startsWith("ES-")) { deeplTarget = "ES"; } else if (deeplTarget === "ZH-CN") { deeplTarget = "ZH-HANS"; } else if (deeplTarget === "ZH-TW") { deeplTarget = "ZH-HANT"; }  const bodyObj = { text: [text], target_lang: deeplTarget };  // В режиме slang просим DeepL использовать неформальное обращение (если язык поддерживает) if (styleId === "slang") { bodyObj.formality = "prefer_less"; }  const res = await fetchWithTimeout(endpoint, { method: "POST", headers: { "Authorization": `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(bodyObj)
  });

  if (!res.ok) {
    throw new Error(`DeepL HTTP ${res.status}`); }  const data = await res.json(); const item = data?.translations?.[0]; if (!item \vert{}\vert{} !item.text) throw new Error("Empty DeepL response");  const detectedSource = (item.detected_source_language \vert{}\vert{} "auto").toLowerCase(); if (isSameLanguage(detectedSource, targetLang)) { return { skipped: true, sourceLang: detectedSource }; }  return { text: item.text, sourceLang: detectedSource.toUpperCase(), targetLang, provider: "DeepL" }; }  /** * Вспомогательное определение языка через публичный эндпоинт Google */ async function detectViaGoogle(text) { try { const sample = text.slice(0, 180); const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sample)}`;
    const res = await fetchWithTimeout(url, {}, 3500);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.[2] === "string" ? data[2] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Провайдер 3: Бесплатный Google Translate (translate.googleapis.com/translate_a/single)
 */
async function translateViaGoogle(text, targetLang) {
  // Приводим региональные коды к формату Google Translate
  let googleTl = targetLang;
  if (targetLang.startsWith("en-")) googleTl = "en";
  else if (targetLang.startsWith("es-")) googleTl = "es";
  else if (targetLang === "he") googleTl = "iw";

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(googleTl)}&dt=t&dj=1&q=${encodeURIComponent(text)}`;
  const res = await fetchWithTimeout(url);

  if (!res.ok) {
    throw new Error(`Google HTTP ${res.status}`); }  const data = await res.json(); const detectedSource = (data?.src \vert{}\vert{} "auto").toLowerCase();  if (isSameLanguage(detectedSource, targetLang)) { return { skipped: true, sourceLang: detectedSource }; }  const sentences = Array.isArray(data?.sentences) ? data.sentences.map((s) => s.trans \vert{}\vert{} "").join("") : "";  if (!sentences) throw new Error("Empty Google response");  return { text: sentences.trim(), sourceLang: detectedSource.toUpperCase(), targetLang, provider: "Google" }; }  /** * Построение цепочки провайдеров с fallback в зависимости от настроек и стиля */ function getProviderChain(settings) { const preferred = settings.provider \vert{}\vert{} "auto"; const style = settings.style \vert{}\vert{} "slang";  if (preferred === "openai") return ["openai", "deepl", "google"]; if (preferred === "deepl") return ["deepl", "google"]; if (preferred === "google") return ["google"];  // Режим "auto": // 1. OpenAI — основной для slang и native (используется первым, если задан ключ или прокси) // 2. DeepL — fallback для literal/native (или если OpenAI недоступен) // 3. Google — безотказный бесплатный fallback без ключа if (style === "literal") { return ["deepl", "openai", "google"]; } return ["openai", "deepl", "google"]; }  /** * Синхронное получение перевода из кэша (чтобы не мигал UI при скролле чата) */ export function getCachedTranslation(text, settings) { const targetLang = settings.targetLang \vert{}\vert{} "ru"; const style = settings.style \vert{}\vert{} "slang"; const provider = settings.provider \vert{}\vert{} "auto"; const cacheKey = `${targetLang}|${style}\vert{}${provider}|${text}`; return memoryCache.get(cacheKey) \vert{}\vert{} null; }  /** * Основная асинхронная функция перевода сообщения */ export async function translateText(text, settings) { const targetLang = settings.targetLang \vert{}\vert{} "ru"; const style = settings.style \vert{}\vert{} "slang"; const provider = settings.provider \vert{}\vert{} "auto"; const cacheKey = `${targetLang}|${style}\vert{}${provider}|${text}`;  if (memoryCache.has(cacheKey)) { return memoryCache.get(cacheKey); }  // Быстрая локальная проверка по Unicode: если язык уже совпадает с целевым, не делаем сетевой запрос const heuristicLang = detectLanguageHeuristic(text); if (heuristicLang && isSameLanguage(heuristicLang, targetLang)) { const skippedResult = { skipped: true, sourceLang: heuristicLang }; memoryCache.set(cacheKey, skippedResult); return skippedResult; }  if (inflightRequests.has(cacheKey)) { return inflightRequests.get(cacheKey); }  const taskPromise = enqueueRequest(async () => { const chain = getProviderChain(settings); let lastErr = null;  for (const prov of chain) { try { let result = null; if (prov === "openai") { result = await translateViaOpenAI(text, targetLang, style, settings); } else if (prov === "deepl") { result = await translateViaDeepL(text, targetLang, style, settings); } else if (prov === "google") { result = await translateViaGoogle(text, targetLang); }  if (result) { // Если текст перевода полностью совпал с оригиналом, помечаем как пропущенный if (!result.skipped && result.text.trim().toLowerCase() === text.trim().toLowerCase()) { result = { skipped: true, sourceLang: result.sourceLang }; } memoryCache.set(cacheKey, result); persistCache(); return result; } } catch (err) { lastErr = err; // Переходим к следующему провайдеру в цепочке fallback } }  notifyTranslationError(); throw lastErr \vert{}\vert{} new Error("All providers failed"); }).finally(() => { inflightRequests.delete(cacheKey); });  inflightRequests.set(cacheKey, taskPromise); return taskPromise; } ```  ---  ### 4. `settings.js`  Экран настроек на базе компонентов React Native и встроенных `Forms` из `bunny.ui.components` (с fallback на базовые компоненты React Native, если структура UI-кита в конкретной сборке Bunny отличается).  ```javascript // settings.js — Экран настроек плагина (React Native)  import { LANGUAGES, STYLES, PROVIDERS } from "./langs"; import { clearTranslationCache, getCacheSize } from "./translator";  const getBunny = () => globalThis.bunny ?? globalThis.vendetta ?? {};  /** * Дефолтные настройки плагина (инициализируются в bunny.storage) */ export const DEFAULT_SETTINGS = { enabled: true, targetLang: "ru", style: "slang", provider: "auto", openaiKey: "", openaiEndpoint: "https://api.openai.com/v1", openaiModel: "gpt-4o-mini", deeplKey: "", translateOwn: false, showOriginal: true, singleChannelOnly: false, singleChannelId: "", translateDM: true };  export function ensureDefaultSettings(storage) { if (!storage) return DEFAULT_SETTINGS; for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) { if (storage[k] === undefined) { storage[k] = v; } } return storage; }  export default function SettingsScreen() { const bunny = getBunny(); const React = bunny?.metro?.common?.React ?? globalThis.React; const RN = bunny?.metro?.common?.ReactNative ?? {}; const storage = ensureDefaultSettings(bunny.storage);  // Подключаем реактивный хук useProxy, чтобы изменения storage сразу перерисовывали UI const useProxy = bunny?.storage?.useProxy; if (typeof useProxy === "function") { useProxy(storage); }  const [, forceUpdate] = React.useReducer((x) => x + 1, 0); const [showLangPicker, setShowLangPicker] = React.useState(false); const [langSearch, setLangSearch] = React.useState("");  const updateSetting = (key, value) => { storage[key] = value; forceUpdate(); };  const showToast = (msg) => { const fn = bunny?.ui?.toasts?.showToast ?? bunny?.ui?.showToast; if (typeof fn === "function") fn(msg); };  const { ScrollView, View, Text, TextInput, TouchableOpacity, Switch, StyleSheet } = RN;  // Достаём стандартные компоненты форм Discord/Bunny, если они доступны const Forms = bunny?.ui?.components?.Forms ?? {}; const FormSection = Forms.FormSection; const FormSwitchRow = Forms.FormSwitchRow; const FormRow = Forms.FormRow;  const currentLang = LANGUAGES[storage.targetLang] \vert{}\vert{} LANGUAGES["ru"]; const langEntries = Object.values(LANGUAGES).filter((l) => { if (!langSearch.trim()) return true; const q = langSearch.toLowerCase(); return l.name.toLowerCase().includes(q) \vert{}\vert{} l.code.toLowerCase().includes(q); });  const styles = StyleSheet.create({ container: { flex: 1, padding: 14, backgroundColor: "transparent" }, card: { backgroundColor: "rgba(255, 255, 255, 0.05)", borderRadius: 12, padding: 14, marginBottom: 14 }, sectionTitle: { color: "#B5BAC1", fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 10, letterSpacing: 0.5 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 }, label: { color: "#F2F3F5", fontSize: 15, fontWeight: "500", flex: 1, paddingRight: 10 }, sublabel: { color: "#949BA4", fontSize: 12, marginTop: 2 }, input: { backgroundColor: "rgba(0, 0, 0, 0.35)", color: "#FFFFFF", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 6, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.08)" }, segmentRow: { flexDirection: "row", backgroundColor: "rgba(0, 0, 0, 0.35)", borderRadius: 8, padding: 3, marginVertical: 6 }, segmentBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 6 }, segmentBtnActive: { backgroundColor: "#5865F2" }, segmentText: { color: "#B5BAC1", fontSize: 13, fontWeight: "600" }, segmentTextActive: { color: "#FFFFFF" }, dropdownBtn: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.35)", paddingHorizontal: 12, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.1)" }, dropdownText: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" }, langList: { marginTop: 8, maxHeight: 260, backgroundColor: "rgba(0, 0, 0, 0.45)", borderRadius: 8, padding: 6 }, langItem: { paddingVertical: 9, paddingHorizontal: 10, borderRadius: 6, flexDirection: "row", justifyContent: "space-between" }, langItemActive: { backgroundColor: "rgba(88, 101, 242, 0.35)" }, dangerBtn: { backgroundColor: "#DA373C", borderRadius: 8, paddingVertical: 11, alignItems: "center", marginTop: 6 }, dangerBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 } });  // Универсальный рендер переключателя (использует FormSwitchRow или нативный Switch) const renderToggle = (title, subtitle, key) => { if (FormSwitchRow) { return React.createElement(FormSwitchRow, { label: title, subLabel: subtitle, value: Boolean(storage[key]), onValueChange: (v) => updateSetting(key, v) }); } return React.createElement( View, { style: styles.row }, React.createElement( View, { style: { flex: 1, paddingRight: 10 } }, React.createElement(Text, { style: styles.label }, title), subtitle ? React.createElement(Text, { style: styles.sublabel }, subtitle) : null ), React.createElement(Switch, { value: Boolean(storage[key]), onValueChange: (v) => updateSetting(key, v) }) ); };  return React.createElement( ScrollView, { style: styles.container, contentContainerStyle: { paddingBottom: 40 } },  // Блок 1: Основные настройки и язык React.createElement( View, { style: styles.card }, React.createElement(Text, { style: styles.sectionTitle }, "Основные настройки"), renderToggle( "Включить автоперевод", "Глобальный переключатель работы плагина BunnyTranslate", "enabled" ),  React.createElement( View, { style: { marginTop: 10 } }, React.createElement(Text, { style: styles.label }, "Целевой язык перевода"), React.createElement( TouchableOpacity, { style: [styles.dropdownBtn, { marginTop: 6 }], onPress: () => setShowLangPicker(!showLangPicker) }, React.createElement( Text, { style: styles.dropdownText }, `${currentLang.flag}  ${currentLang.name} (${currentLang.code})`
          ),
          React.createElement(
            Text,
            { style: { color: "#B5BAC1", fontSize: 14 } },
            showLangPicker ? "▲" : "▼"
          )
        ),

        showLangPicker
          ? React.createElement(
              View,
              { style: styles.langList },
              React.createElement(TextInput, {
                style: [styles.input, { marginTop: 0, marginBottom: 6 }],
                placeholder: "Поиск языка (например: ru, en-US, ja)...",
                placeholderTextColor: "#72767D",
                value: langSearch,
                onChangeText: setLangSearch
              }),
              React.createElement(
                ScrollView,
                { nestedScrollEnabled: true },
                ...langEntries.map((item) =>
                  React.createElement(
                    TouchableOpacity,
                    {
                      key: item.code,
                      style: [
                        styles.langItem,
                        storage.targetLang === item.code ? styles.langItemActive : null
                      ],
                      onPress: () => {
                        updateSetting("targetLang", item.code);
                        setShowLangPicker(false);
                      }
                    },
                    React.createElement(
                      Text,
                      { style: { color: "#FFFFFF", fontSize: 14 } },
                      `${item.flag}${item.name}`
                    ),
                    React.createElement(
                      Text,
                      { style: { color: "#949BA4", fontSize: 13 } },
                      item.code
                    )
                  )
                )
              )
            )
          : null
      )
    ),

    // Блок 2: Стиль перевода (Сегмент-контрол)
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.sectionTitle }, "Стиль перевода"),
      React.createElement(
        View,
        { style: styles.segmentRow },
        ...Object.values(STYLES).map((st) => {
          const active = storage.style === st.id;
          return React.createElement(
            TouchableOpacity,
            {
              key: st.id,
              style: [styles.segmentBtn, active ? styles.segmentBtnActive : null],
              onPress: () => updateSetting("style", st.id)
            },
            React.createElement(
              Text,
              { style: [styles.segmentText, active ? styles.segmentTextActive : null] },
              st.id.toUpperCase()
            )
          );
        })
      ),
      React.createElement(
        Text,
        { style: styles.sublabel },
        STYLES[storage.style]?.description || ""
      )
    ),

    // Блок 3: Провайдер и API-ключи
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.sectionTitle }, "Провайдер и API-ключи"),
      React.createElement(
        View,
        { style: styles.segmentRow },
        ...["auto", "openai", "deepl", "google"].map((provId) => {
          const active = storage.provider === provId;
          return React.createElement(
            TouchableOpacity,
            {
              key: provId,
              style: [styles.segmentBtn, active ? styles.segmentBtnActive : null],
              onPress: () => updateSetting("provider", provId)
            },
            React.createElement(
              Text,
              { style: [styles.segmentText, active ? styles.segmentTextActive : null] },
              provId === "auto" ? "АВТО" : provId.toUpperCase()
            )
          );
        })
      ),

      React.createElement(Text, { style: [styles.label, { marginTop: 10 }] }, "OpenAI API Key"),
      React.createElement(TextInput, {
        style: styles.input,
        placeholder: "sk-...",
        placeholderTextColor: "#72767D",
        secureTextEntry: true,
        autoCapitalize: "none",
        value: storage.openaiKey || "",
        onChangeText: (v) => updateSetting("openaiKey", v)
      }),

      React.createElement(Text, { style: styles.label }, "OpenAI Base URL (или Cloudflare Worker)"),
      React.createElement(TextInput, {
        style: styles.input,
        placeholder: "https://api.openai.com/v1",
        placeholderTextColor: "#72767D",
        autoCapitalize: "none",
        value: storage.openaiEndpoint || "",
        onChangeText: (v) => updateSetting("openaiEndpoint", v)
      }),

      React.createElement(Text, { style: styles.label }, "Модель LLM"),
      React.createElement(TextInput, {
        style: styles.input,
        placeholder: "gpt-4o-mini",
        placeholderTextColor: "#72767D",
        autoCapitalize: "none",
        value: storage.openaiModel || "",
        onChangeText: (v) => updateSetting("openaiModel", v)
      }),

      React.createElement(Text, { style: styles.label }, "DeepL API Key"),
      React.createElement(TextInput, {
        style: styles.input,
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx",
        placeholderTextColor: "#72767D",
        secureTextEntry: true,
        autoCapitalize: "none",
        value: storage.deeplKey || "",
        onChangeText: (v) => updateSetting("deeplKey", v)
      })
    ),

    // Блок 4: Фильтры каналов и отображение
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.sectionTitle }, "Режим отображения и каналы"),
      renderToggle(
        "Показывать оригинал",
        "Если выключено — перевод полностью заменяет текст сообщения",
        "showOriginal"
      ),
      renderToggle(
        "Переводить свои сообщения",
        "Переводить входящие/отправленные сообщения от вашего аккаунта",
        "translateOwn"
      ),
      renderToggle(
        "Переводить ЛС и группы",
        "Работать в личных сообщениях (DM) и групповых чатах",
        "translateDM"
      ),
      renderToggle(
        "Переводить только в одном канале",
        "Ограничить работу плагина конкретным текстовым каналом по ID",
        "singleChannelOnly"
      ),
      storage.singleChannelOnly
        ? React.createElement(
            View,
            { style: { marginTop: 6 } },
            React.createElement(Text, { style: styles.label }, "ID канала"),
            React.createElement(TextInput, {
              style: styles.input,
              placeholder: "Например: 112233445566778899",
              placeholderTextColor: "#72767D",
              keyboardType: "numeric",
              value: storage.singleChannelId || "",
              onChangeText: (v) => updateSetting("singleChannelId", v.trim())
            })
          )
        : null
    ),

    // Блок 5: Управление кэшем
    React.createElement(
      View,
      { style: styles.card },
      React.createElement(Text, { style: styles.sectionTitle }, "Кэш и память"),
      React.createElement(
        Text,
        { style: styles.sublabel },
        `Сохранено переводов в кэше: ${getCacheSize()} / 500` ), React.createElement( TouchableOpacity, { style: styles.dangerBtn, onPress: () => { clearTranslationCache(); forceUpdate(); showToast("Кэш переводов очищен"); } }, React.createElement(Text, { style: styles.dangerBtnText }, "Очистить кэш переводов") ) ) ); } ```  ---  ### 5. `index.js`  Точка входа плагина: поиск модулей через `bunny.metro` с цепочкой fallback-ов, перехват рендера сообщений без поломки встроенной разметки и копирования текста, подключение слэш-команд `/tr` (если API `bunny.commands` присутствует в сборке) и корректная очистка ресурсов в `onUnload`.  ```javascript // index.js — Точка входа плагина BunnyTranslate (onLoad / onUnload, патчи рендера, команды)  import SettingsScreen, { ensureDefaultSettings } from "./settings"; import { initTranslatorCache, shutdownTranslator, shouldTranslateMessage, getCachedTranslation, translateText, clearTranslationCache } from "./translator"; import { LANGUAGES } from "./langs";  // Graceful-fallback для различных ревизий Bunny / Vendetta / Revenge const getBunny = () => globalThis.bunny ?? globalThis.vendetta ?? {};  const unpatches = [];  /** * React-компонент блока перевода, встраиваемый под оригинальным сообщением. * Не затрагивает оригинальное дерево разметки и не мешает стандартному копированию текста по long-press. */ function TranslationBlock({ message, settings }) { const bunny = getBunny(); const React = bunny?.metro?.common?.React ?? globalThis.React; const RN = bunny?.metro?.common?.ReactNative ?? {}; const { View, Text, TouchableOpacity } = RN;  const [result, setResult] = React.useState(() => getCachedTranslation(message.content, settings) ); const [expanded, setExpanded] = React.useState(true);  React.useEffect(() => { let isMounted = true; const cached = getCachedTranslation(message.content, settings); if (cached) { setResult(cached); return; }  translateText(message.content, settings) .then((res) => { if (isMounted && res) setResult(res); }) .catch(() => { // Ошибки обрабатываются тихим тостом внутри translator.js });  return () => { isMounted = false; }; }, [ message.id, message.content, settings.targetLang, settings.style, settings.provider ]);  if (!result \vert{}\vert{} result.skipped \vert{}\vert{} !result.text) return null;  return React.createElement( TouchableOpacity, { activeOpacity: 0.75, onPress: () => setExpanded(!expanded), style: { marginTop: 4, paddingLeft: 8, paddingVertical: 2, borderLeftWidth: 2, borderLeftColor: "rgba(88, 101, 242, 0.65)" } }, React.createElement( Text, { style: { color: "#B5BAC1", fontSize: 13.5, lineHeight: 18 }, // По умолчанию показываем весь текст без обрезки; по тапу можно свернуть до 2 строк numberOfLines: expanded ? undefined : 2 }, `🌐 ${result.text}`
    ),
    React.createElement(
      Text,
      {
        style: {
          color: "#72767D",
          fontSize: 10.5,
          marginTop: 2
        }
      },
      `${result.sourceLang} →${result.targetLang} · ${result.provider}` ) ); }  /** * Проверка, разрешён ли перевод в текущем канале/ЛС согласно настройкам */ function isChannelAllowed(channelId, settings, ChannelStore) { if (!channelId) return true;  // Если включён режим "Переводить только в одном канале" if (settings.singleChannelOnly) { const targetId = (settings.singleChannelId \vert{}\vert{} "").trim(); return Boolean(targetId && channelId === targetId); }  // Проверка ЛС и групповых чатов (типы 1 — DM, 3 — Group DM в Discord) if (!settings.translateDM && ChannelStore?.getChannel) { const ch = ChannelStore.getChannel(channelId); if (ch && (ch.type === 1 \vert{}\vert{} ch.type === 3)) { return false; } }  return true; }  /** * Поиск и патч рендер-компонента сообщения с цепочкой fallback-ов для разных версий Bunny */ function patchMessageRenderer() { const bunny = getBunny(); const metro = bunny?.metro; const patcher = bunny?.patcher; const React = metro?.common?.React ?? globalThis.React; const RN = metro?.common?.ReactNative ?? {};  if (!metro \vert{}\vert{} !patcher \vert{}\vert{} !React) return;  const findByProps = metro.findByProps; const findByName = metro.findByName; const findByStoreName = metro.findByStoreName;  const UserStore = findByStoreName ? findByStoreName("UserStore") : null; const ChannelStore = findByStoreName ? findByStoreName("ChannelStore") : null;  // Цепочка поиска компонента контента сообщения (от новых версий RN Discord к старым) const candidates = [ { mod: findByProps?.("MessageContent"), key: "MessageContent" }, { mod: findByProps?.("ChatMessage"), key: "ChatMessage" }, { mod: findByName?.("MessageContent", false), key: "default" }, { mod: findByProps?.("renderContent", "Message"), key: "Message" } ];  let targetMod = null; let targetKey = null;  for (const c of candidates) { if (c.mod && typeof c.mod[c.key] === "function") { targetMod = c.mod; targetKey = c.key; break; } // Если компонент обёрнут в React.memo, патчим его внутреннюю функцию .type if (c.mod && c.mod[c.key] && typeof c.mod[c.key].type === "function") { targetMod = c.mod[c.key]; targetKey = "type"; break; } }  if (!targetMod \vert{}\vert{} !targetKey) { const showToast = bunny?.ui?.toasts?.showToast ?? bunny?.ui?.showToast; if (typeof showToast === "function") { showToast("BunnyTranslate: не найден модуль MessageContent"); } return; }  const unpatch = patcher.after(targetKey, targetMod, (args, res) => { try { const settings = ensureDefaultSettings(bunny.storage); if (!settings.enabled) return res;  const props = args?.[0] \vert{}\vert{} {}; const message = props.message \vert{}\vert{} props.chatMessage \vert{}\vert{} props.item?.message; if (!message) return res;  const currentUserId = UserStore?.getCurrentUser?.()?.id; const channelId = message.channel_id \vert{}\vert{} props.channel?.id \vert{}\vert{} props.channelId;  if (!isChannelAllowed(channelId, settings, ChannelStore)) return res; if (!shouldTranslateMessage(message, currentUserId, settings)) return res;  // Если включён режим замены оригинала и перевод уже в кэше — подменяем отображение const cached = getCachedTranslation(message.content, settings); if (!settings.showOriginal && cached && !cached.skipped && cached.text) { return React.createElement(TranslationBlock, { key: `bt-replace-${message.id}`,
          message,
          settings
        });
      }

      // Стандартный режим: рендерим оригинальное сообщение и под ним блок перевода
      const View = RN.View;
      if (!View) return res;

      return React.createElement(
        View,
        { style: { flexDirection: "column" } },
        res,
        React.createElement(TranslationBlock, {
          key: `bt-sub-${message.id}`, message, settings }) ); } catch (_) { return res; } });  unpatches.push(unpatch); }  /** * Регистрация клиентских команд (если API bunny.commands доступен в текущей сборке) */ function registerPluginCommands() { const bunny = getBunny(); const commandsApi = bunny?.commands; if (!commandsApi \vert{}\vert{} typeof commandsApi.registerCommand !== "function") { // В некоторых версиях Bunny команды отключены — управление остаётся через экран настроек return; }  const showToast = (msg) => { const fn = bunny?.ui?.toasts?.showToast ?? bunny?.ui?.showToast; if (typeof fn === "function") fn(msg); };  try { const unreg = commandsApi.registerCommand({ name: "tr-lang", displayName: "tr-lang", description: "Быстро сменить целевой язык BunnyTranslate (например: ru, en-US, ja)", displayDescription: "Быстро сменить целевой язык BunnyTranslate (например: ru, en-US, ja)", options: [ { name: "code", displayName: "code", description: "Код языка из списка (ru, ja, en-US, de, es и т.д.)", displayDescription: "Код языка из списка (ru, ja, en-US, de, es и т.д.)", type: 3, // STRING required: true } ], applicationId: "-1", inputType: 1, type: 1, execute: (args) => { const storage = ensureDefaultSettings(bunny.storage); const codeArg = args?.[0]?.value?.trim(); if (codeArg && LANGUAGES[codeArg]) { storage.targetLang = codeArg; clearTranslationCache(); showToast(`BunnyTranslate: язык изменён на ${LANGUAGES[codeArg].flag} ${LANGUAGES[codeArg].name}`); } else { showToast(`Неизвестный код языка: ${codeArg}`);
        }
      }
    });

    if (typeof unreg === "function") {
      unpatches.push(unreg);
    }
  } catch (_) {}
}

export default {
  onLoad() {
    const bunny = getBunny();
    ensureDefaultSettings(bunny.storage);
    initTranslatorCache();
    patchMessageRenderer();
    registerPluginCommands();
  },

  onUnload() {
    // Снимаем все патчи и команды
    for (const unpatch of unpatches.splice(0, unpatches.length)) {
      try {
        if (typeof unpatch === "function") unpatch();
      } catch (_) {}
    }
    // Очищаем таймеры и очередь запросов
    shutdownTranslator();
  },

  settings: SettingsScreen
};
