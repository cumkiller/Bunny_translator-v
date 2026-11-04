return (function () {
  "use strict";

  // Универсальный доступ к API мода (Bunny / Vendetta / Revenge)
  const getBunny = () =>
    (typeof bunny !== "undefined" ? bunny : null) ??
    (typeof vendetta !== "undefined" ? vendetta : null) ??
    globalThis.bunny ??
    globalThis.vendetta ??
    {};

  // ============================================================================
  // 1. КОНФИГ ЯЗЫКОВ И СТИЛЕЙ
  // ============================================================================
  const LANGUAGES = {
    "ru": { code: "ru", name: "Русский", flag: "🇷🇺", style: "native" },
    "ja": { code: "ja", name: "日本語 (Японский)", flag: "🇯🇵", style: "native" },
    "en-US": { code: "en-US", name: "English (US)", flag: "🇺🇸", style: "native" },
    "en-GB": { code: "en-GB", name: "English (UK)", flag: "🇬🇧", style: "native" },
    "en-AU": { code: "en-AU", name: "English (Australia)", flag: "🇦🇺", style: "native" },
    "en-CA": { code: "en-CA", name: "English (Canada)", flag: "🇨🇦", style: "native" },
    "en-IN": { code: "en-IN", name: "English (India)", flag: "🇮🇳", style: "native" },
    "pt-BR": { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷", style: "native" },
    "pt-PT": { code: "pt-PT", name: "Português (Portugal)", flag: "🇵🇹", style: "native" },
    "es": { code: "es", name: "Español (España)", flag: "🇪🇸", style: "native" },
    "es-MX": { code: "es-MX", name: "Español (México)", flag: "🇲🇽", style: "native" },
    "es-AR": { code: "es-AR", name: "Español (Argentina)", flag: "🇦🇷", style: "native" },
    "de": { code: "de", name: "Deutsch", flag: "🇩🇪", style: "native" },
    "fr": { code: "fr", name: "Français", flag: "🇫🇷", style: "native" },
    "it": { code: "it", name: "Italiano", flag: "🇮🇹", style: "native" },
    "ko": { code: "ko", name: "한국어 (Корейский)", flag: "🇰🇷", style: "native" },
    "zh-CN": { code: "zh-CN", name: "中文 (Упрощённый)", flag: "🇨🇳", style: "native" },
    "zh-TW": { code: "zh-TW", name: "中文 (Традиционный)", flag: "🇹🇼", style: "native" },
    "uk": { code: "uk", name: "Українська", flag: "🇺🇦", style: "native" },
    "pl": { code: "pl", name: "Polski", flag: "🇵🇱", style: "native" },
    "tr": { code: "tr", name: "Türkçe", flag: "🇹🇷", style: "native" },
    "ar": { code: "ar", name: "العربية (Арабский)", flag: "🇸🇦", style: "native" },
    "hi": { code: "hi", name: "हिन्दी (Хинди)", flag: "🇮🇳", style: "native" },
    "vi": { code: "vi", name: "Tiếng Việt", flag: "🇻🇳", style: "native" },
    "th": { code: "th", name: "ไทย (Тайский)", flag: "🇹🇭", style: "native" },
    "id": { code: "id", name: "Bahasa Indonesia", flag: "🇮🇩", style: "native" },
    "nl": { code: "nl", name: "Nederlands", flag: "🇳🇱", style: "native" },
    "sv": { code: "sv", name: "Svenska", flag: "🇸🇪", style: "native" },
    "el": { code: "el", name: "Ελληνικά (Греческий)", flag: "🇬🇷", style: "native" },
    "he": { code: "he", name: "עברית (Иврит)", flag: "🇮🇱", style: "native" },
    "cs": { code: "cs", name: "Čeština", flag: "🇨🇿", style: "native" },
    "ro": { code: "ro", name: "Română", flag: "🇷🇴", style: "native" },
    "hu": { code: "hu", name: "Magyar", flag: "🇭🇺", style: "native" },
    "fi": { code: "fi", name: "Suomi", flag: "🇫🇮", style: "native" }
  };

  const STYLES = {
    literal: { id: "literal", description: "Дословный и точный перевод близко к оригиналу." },
    native: { id: "native", description: "Естественная речь носителя языка с адаптацией идиом." },
    slang: { id: "slang", description: "Живой интернет-сленг, мемы, мат и эмодзи." }
  };

  function buildSystemPrompt(langCode, styleId) {
    const langObj = LANGUAGES[langCode] || { name: langCode };
    const langName = `${langObj.name} (${langCode})`;
    if (styleId === "literal") {
      return `Ты — профессиональный переводчик на ${langName}. Переведи сообщение точно и дословно, сохраняя эмодзи. Не добавляй ничего от себя.`;
    }
    if (styleId === "native") {
      return `Ты — носитель языка ${langName}. Переведи сообщение естественно, как говорят в чатах, адаптируя идиомы и сохраняя эмодзи. Не добавляй ничего от себя.`;
    }
    return `Ты — носитель ${langName}. Переведи так, как реально говорят в интернете. Сохраняй сленг, мат, эмодзи. Непереводимое — оригинал + пояснение в скобках (сленг: ...). Не добавляй ничего от себя.`;
  }

  function detectLanguageHeuristic(text) {
    if (!text) return null;
    const clean = text
      .replace(/https?:\/\/\S+/g, "")
      .replace(/<a?:\w+:\d+>/g, "")
      .replace(/<@!?\d+>|<#\d+>|<@&\d+>/g, "")
      .replace(/[\d\s.,!?()[\]{}"'`~@#$%^&*_+=<>|\\/-]/g, "");

    if (!clean) return null;
    if (/[\u3040-\u30ff]/.test(clean)) return "ja";
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(clean)) return "ko";
    if (/[\u4e00-\u9fff]/.test(clean)) return "zh";
    if (/[\u0590-\u05ff]/.test(clean)) return "he";
    if (/[\u0600-\u06ff]/.test(clean)) return "ar";
    if (/[\u0e00-\u0e7f]/.test(clean)) return "th";
    if (/[\u0900-\u097f]/.test(clean)) return "hi";
    if (/[\u0370-\u03ff]/.test(clean)) return "el";

    if (/[\u0400-\u04ff]/.test(clean)) {
      if (/[іїєґІЇЄҐ]/.test(clean)) return "uk";
      if (/[ыэъёЫЭЪЁа-яА-Я]/.test(clean)) return "ru";
    }
    return null;
  }

  function isSameLanguage(sourceLang, targetLang) {
    if (!sourceLang || !targetLang) return false;
    const s = sourceLang.toLowerCase().split("-")[0];
    const t = targetLang.toLowerCase().split("-")[0];
    if (s === "zh" && t === "zh") return sourceLang.toLowerCase() === targetLang.toLowerCase();
    return s === t;
  }

  // ============================================================================
  // 2. ХРАНИЛИЩЕ НАСТРОЕК (bunny.storage)
  // ============================================================================
  const DEFAULT_SETTINGS = {
    enabled: true,
    targetLang: "ru",
    style: "slang",
    provider: "auto",
    openaiKey: "",
    openaiEndpoint: "https://api.openai.com/v1",
    openaiModel: "gpt-4o-mini",
    deeplKey: "",
    translateOwn: false,
    showOriginal: true,
    singleChannelOnly: false,
    singleChannelId: "",
    translateDM: true
  };

  function getSettings() {
    const b = getBunny();
    const storage = b.storage || {};
    for (const k in DEFAULT_SETTINGS) {
      if (storage[k] === undefined) storage[k] = DEFAULT_SETTINGS[k];
    }
    return storage;
  }

  // ============================================================================
  // 3. ОЧЕРЕДЬ, ЛИМИТЫ И ПРОВАЙДЕРЫ ПЕРЕВОДА
  // ============================================================================
  const MAX_CONCURRENT = 3;
  const MAX_PER_SECOND = 5;
  const REQUEST_TIMEOUT_MS = 6000;
  const MAX_CACHE_SIZE = 500;
  const TOAST_COOLDOWN_MS = 60000;

  const memoryCache = new Map();
  const inflightRequests = new Map();
  const originalContentMap = new Map();

  let activeCount = 0;
  let requestTimestamps = [];
  const requestQueue = [];
  let queueTimer = null;
  let lastErrorToastTime = 0;
  let isUnloaded = false;

  function showToastSafe(msg) {
    const b = getBunny();
    const fn = b?.ui?.toasts?.showToast ?? b?.ui?.showToast;
    if (typeof fn === "function") {
      try { fn(msg); } catch (_) {}
    }
  }

  function notifyTranslationError() {
    const now = Date.now();
    if (now - lastErrorToastTime < TOAST_COOLDOWN_MS) return;
    lastErrorToastTime = now;
    showToastSafe("Перевод недоступен");
  }

  function initTranslatorCache() {
    isUnloaded = false;
    const storage = getBunny().storage;
    if (storage && Array.isArray(storage.translationCacheEntries)) {
      for (const item of storage.translationCacheEntries) {
        if (Array.isArray(item) && item.length === 2) {
          memoryCache.set(item[0], item[1]);
        }
      }
    }
  }

  function persistCache() {
    const storage = getBunny().storage;
    if (!storage) return;
    if (memoryCache.size > MAX_CACHE_SIZE) {
      const excess = memoryCache.size - MAX_CACHE_SIZE;
      const keys = memoryCache.keys();
      for (let i = 0; i < excess; i++) {
        const k = keys.next().value;
        if (k !== undefined) memoryCache.delete(k);
      }
    }
    try {
      storage.translationCacheEntries = Array.from(memoryCache.entries());
    } catch (_) {}
  }

  function clearTranslationCache() {
    memoryCache.clear();
    const storage = getBunny().storage;
    if (storage) storage.translationCacheEntries = [];
  }

  function shutdownTranslator() {
    isUnloaded = true;
    if (queueTimer) {
      clearTimeout(queueTimer);
      queueTimer = null;
    }
    while (requestQueue.length > 0) {
      const item = requestQueue.shift();
      if (item?.reject) item.reject(new Error("Unloaded"));
    }
    inflightRequests.clear();
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      if (controller) controller.abort();
    }, timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller ? controller.signal : undefined
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function processQueue() {
    if (isUnloaded || requestQueue.length === 0) return;
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter((ts) => now - ts < 1000);

    if (activeCount >= MAX_CONCURRENT) return;
    if (requestTimestamps.length >= MAX_PER_SECOND) {
      if (!queueTimer) {
        const waitMs = Math.max(50, 1000 - (now - requestTimestamps[0]) + 20);
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

    nextTask.fn()
      .then(nextTask.resolve)
      .catch(nextTask.reject)
      .finally(() => {
        activeCount = Math.max(0, activeCount - 1);
        processQueue();
      });

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

  function shouldTranslateMessage(message, currentUserId, settings) {
    if (!message || typeof message.content !== "string") return false;
    if (message.content.includes("🌐 ")) return false;
    if (message.type !== undefined && message.type !== 0 && message.type !== 19) return false;
    if (message.author?.bot || message.webhook_id || message.webhookId) return false;
    if (!settings.translateOwn && currentUserId && message.author?.id === currentUserId) return false;

    const stripped = message.content
      .replace(/<a?:\w+:\d+>/g, "")
      .replace(/<@!?\d+>|<#\d+>|<@&\d+>/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .trim();

    if (stripped.length < 2) return false;
    return /[a-zA-Z\u00C0-\u024F\u0370-\u1FFF\u3040-\uD7AF]/.test(stripped);
  }

  async function detectViaGoogle(text) {
    try {
      const sample = text.slice(0, 160);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sample)}`;
      const res = await fetchWithTimeout(url, {}, 3000);
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.[2] === "string" ? data[2] : null;
    } catch (_) {
      return null;
    }
  }

  async function translateViaOpenAI(text, targetLang, styleId, settings) {
    const apiKey = (settings.openaiKey || "").trim();
    const baseUrl = (settings.openaiEndpoint || "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = (settings.openaiModel || "gpt-4o-mini").trim();
    const isCustomProxy = baseUrl !== "https://api.openai.com/v1";

    if (!apiKey && !isCustomProxy) throw new Error("No OpenAI key");

    const detectedSource = detectLanguageHeuristic(text) || (await detectViaGoogle(text));
    if (detectedSource && isSameLanguage(detectedSource, targetLang)) {
      return { skipped: true, sourceLang: detectedSource };
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: styleId === "literal" ? 0.1 : 0.4,
        max_tokens: 800,
        messages: [
          { role: "system", content: buildSystemPrompt(targetLang, styleId) },
          { role: "user", content: text }
        ]
      })
    });

    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error("Empty OpenAI output");

    return {
      text: out,
      sourceLang: (detectedSource || "AUTO").toUpperCase(),
      targetLang,
      provider: "OpenAI"
    };
  }

  async function translateViaDeepL(text, targetLang, styleId, settings) {
    const apiKey = (settings.deeplKey || "").trim();
    if (!apiKey) throw new Error("No DeepL key");

    const endpoint = apiKey.endsWith(":fx")
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";

    let deeplTarget = targetLang.toUpperCase();
    if (deeplTarget.startsWith("EN-") && deeplTarget !== "EN-US" && deeplTarget !== "EN-GB") deeplTarget = "EN-US";
    else if (deeplTarget.startsWith("ES-")) deeplTarget = "ES";
    else if (deeplTarget === "ZH-CN") deeplTarget = "ZH-HANS";
    else if (deeplTarget === "ZH-TW") deeplTarget = "ZH-HANT";

    const bodyObj = { text: [text], target_lang: deeplTarget };
    if (styleId === "slang") bodyObj.formality = "prefer_less";

    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bodyObj)
    });

    if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
    const data = await res.json();
    const item = data?.translations?.[0];
    if (!item?.text) throw new Error("Empty DeepL output");

    const detectedSource = (item.detected_source_language || "auto").toLowerCase();
    if (isSameLanguage(detectedSource, targetLang)) {
      return { skipped: true, sourceLang: detectedSource };
    }

    return {
      text: item.text,
      sourceLang: detectedSource.toUpperCase(),
      targetLang,
      provider: "DeepL"
    };
  }

  async function translateViaGoogle(text, targetLang) {
    let googleTl = targetLang;
    if (targetLang.startsWith("en-")) googleTl = "en";
    else if (targetLang.startsWith("es-")) googleTl = "es";
    else if (targetLang === "he") googleTl = "iw";

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(googleTl)}&dt=t&dj=1&q=${encodeURIComponent(text)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Google HTTP ${res.status}`);

    const data = await res.json();
    const detectedSource = (data?.src || "auto").toLowerCase();
    if (isSameLanguage(detectedSource, targetLang)) {
      return { skipped: true, sourceLang: detectedSource };
    }

    const translated = Array.isArray(data?.sentences)
      ? data.sentences.map((s) => s.trans || "").join("").trim()
      : "";

    if (!translated) throw new Error("Empty Google output");

    return {
      text: translated,
      sourceLang: detectedSource.toUpperCase(),
      targetLang,
      provider: "Google"
    };
  }

  function getProviderChain(settings) {
    const p = settings.provider || "auto";
    if (p === "openai") return ["openai", "deepl", "google"];
    if (p === "deepl") return ["deepl", "google"];
    if (p === "google") return ["google"];
    if (settings.style === "literal") return ["deepl", "openai", "google"];
    return ["openai", "deepl", "google"];
  }

  function makeCacheKey(text, settings) {
    return `${settings.targetLang || "ru"}|${settings.style || "slang"}|${settings.provider || "auto"}|${text}`;
  }

  function getCachedTranslation(text, settings) {
    return memoryCache.get(makeCacheKey(text, settings)) || null;
  }

  async function translateText(text, settings) {
    const cacheKey = makeCacheKey(text, settings);
    if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

    const heuristicLang = detectLanguageHeuristic(text);
    if (heuristicLang && isSameLanguage(heuristicLang, settings.targetLang || "ru")) {
      const skipped = { skipped: true, sourceLang: heuristicLang };
      memoryCache.set(cacheKey, skipped);
      return skipped;
    }

    if (inflightRequests.has(cacheKey)) return inflightRequests.get(cacheKey);

    const promise = enqueueRequest(async () => {
      const chain = getProviderChain(settings);
      let lastErr = null;
      for (const prov of chain) {
        try {
          let res = null;
          if (prov === "openai") res = await translateViaOpenAI(text, settings.targetLang, settings.style, settings);
          else if (prov === "deepl") res = await translateViaDeepL(text, settings.targetLang, settings.style, settings);
          else if (prov === "google") res = await translateViaGoogle(text, settings.targetLang);

          if (res) {
            if (!res.skipped && res.text.trim().toLowerCase() === text.trim().toLowerCase()) {
              res = { skipped: true, sourceLang: res.sourceLang };
            }
            memoryCache.set(cacheKey, res);
            persistCache();
            return res;
          }
        } catch (e) {
          lastErr = e;
        }
      }
      notifyTranslationError();
      throw lastErr || new Error("Translation failed");
    }).finally(() => {
      inflightRequests.delete(cacheKey);
    });

    inflightRequests.set(cacheKey, promise);
    return promise;
  }

  // ============================================================================
  // 4. ЭКРАН НАСТРОЕК (React Native)
  // ============================================================================
  function SettingsScreen() {
    const b = getBunny();
    const React = b?.metro?.common?.React ?? globalThis.React;
    const RN = b?.metro?.common?.ReactNative ?? {};
    const storage = getSettings();

    if (typeof b?.storage?.useProxy === "function") {
      b.storage.useProxy(storage);
    }

    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const [showLangs, setShowLangs] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const setVal = (k, v) => {
      storage[k] = v;
      forceUpdate();
    };

    const { ScrollView, View, Text, TextInput, TouchableOpacity, Switch, StyleSheet } = RN;
    const curLang = LANGUAGES[storage.targetLang] || LANGUAGES["ru"];

    const filteredLangs = Object.values(LANGUAGES).filter((l) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
    });

    const styles = StyleSheet.create({
      container: { flex: 1, padding: 14 },
      card: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 14, marginBottom: 14 },
      secTitle: { color: "#B5BAC1", fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
      row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
      label: { color: "#F2F3F5", fontSize: 15, fontWeight: "500" },
      sub: { color: "#949BA4", fontSize: 12, marginTop: 2 },
      input: {
        backgroundColor: "rgba(0,0,0,0.35)",
        color: "#FFF",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 14,
        marginTop: 6,
        marginBottom: 8
      },
      segRow: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 8, padding: 3, marginVertical: 6 },
      segBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 6 },
      segActive: { backgroundColor: "#5865F2" },
      segTxt: { color: "#B5BAC1", fontSize: 12, fontWeight: "700" },
      segTxtActive: { color: "#FFF" },
      dropBtn: {
        flexDirection: "row",
        justifyContent: "space-between",
        backgroundColor: "rgba(0,0,0,0.35)",
        padding: 11,
        borderRadius: 8,
        marginTop: 6
      },
      clearBtn: { backgroundColor: "#DA373C", borderRadius: 8, paddingVertical: 11, alignItems: "center", marginTop: 8 }
    });

    const renderSwitch = (title, sub, key) =>
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(
          View,
          { style: { flex: 1, paddingRight: 10 } },
          React.createElement(Text, { style: styles.label }, title),
          sub ? React.createElement(Text, { style: styles.sub }, sub) : null
        ),
        React.createElement(Switch, {
          value: Boolean(storage[key]),
          onValueChange: (v) => setVal(key, v)
        })
      );

    return React.createElement(
      ScrollView,
      { style: styles.container, contentContainerStyle: { paddingBottom: 40 } },

      React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.secTitle }, "Основные настройки"),
        renderSwitch("Включить BunnyTranslate", "Автоматически переводить входящие сообщения", "enabled"),
        React.createElement(Text, { style: [styles.label, { marginTop: 8 }] }, "Целевой язык"),
        React.createElement(
          TouchableOpacity,
          { style: styles.dropBtn, onPress: () => setShowLangs(!showLangs) },
          React.createElement(Text, { style: { color: "#FFF", fontSize: 15 } }, `${curLang.flag}  ${curLang.name} (${curLang.code})`),
          React.createElement(Text, { style: { color: "#B5BAC1" } }, showLangs ? "▲" : "▼")
        ),
        showLangs
          ? React.createElement(
              View,
              { style: { marginTop: 8, maxHeight: 240, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 8, padding: 6 } },
              React.createElement(TextInput, {
                style: [styles.input, { marginTop: 0 }],
                placeholder: "Поиск языка (ru, en-US, ja)...",
                placeholderTextColor: "#72767D",
                value: search,
                onChangeText: setSearch
              }),
              React.createElement(
                ScrollView,
                { nestedScrollEnabled: true },
                ...filteredLangs.map((l) =>
                  React.createElement(
                    TouchableOpacity,
                    {
                      key: l.code,
                      style: {
                        padding: 9,
                        borderRadius: 6,
                        backgroundColor: storage.targetLang === l.code ? "rgba(88,101,242,0.35)" : "transparent",
                        flexDirection: "row",
                        justifyContent: "space-between"
                      },
                      onPress: () => {
                        setVal("targetLang", l.code);
                        setShowLangs(false);
                      }
                    },
                    React.createElement(Text, { style: { color: "#FFF" } }, `${l.flag}  ${l.name}`),
                    React.createElement(Text, { style: { color: "#949BA4" } }, l.code)
                  )
                )
              )
            )
          : null
      ),

      React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.secTitle }, "Стиль перевода"),
        React.createElement(
          View,
          { style: styles.segRow },
          ...["literal", "native", "slang"].map((st) => {
            const act = storage.style === st;
            return React.createElement(
              TouchableOpacity,
              { key: st, style: [styles.segBtn, act ? styles.segActive : null], onPress: () => setVal("style", st) },
              React.createElement(Text, { style: [styles.segTxt, act ? styles.segTxtActive : null] }, st.toUpperCase())
            );
          })
        ),
        React.createElement(Text, { style: styles.sub }, STYLES[storage.style]?.description || "")
      ),

      React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.secTitle }, "Провайдер и API-ключи"),
        React.createElement(
          View,
          { style: styles.segRow },
          ...["auto", "openai", "deepl", "google"].map((pr) => {
            const act = storage.provider === pr;
            return React.createElement(
              TouchableOpacity,
              { key: pr, style: [styles.segBtn, act ? styles.segActive : null], onPress: () => setVal("provider", pr) },
              React.createElement(Text, { style: [styles.segTxt, act ? styles.segTxtActive : null] }, pr.toUpperCase())
            );
          })
        ),
        React.createElement(Text, { style: styles.label }, "OpenAI API Key"),
        React.createElement(TextInput, {
          style: styles.input,
          placeholder: "sk-...",
          placeholderTextColor: "#72767D",
          secureTextEntry: true,
          autoCapitalize: "none",
          value: storage.openaiKey || "",
          onChangeText: (v) => setVal("openaiKey", v)
        }),
        React.createElement(Text, { style: styles.label }, "OpenAI Base URL"),
        React.createElement(TextInput, {
          style: styles.input,
          placeholder: "https://api.openai.com/v1",
          placeholderTextColor: "#72767D",
          autoCapitalize: "none",
          value: storage.openaiEndpoint || "",
          onChangeText: (v) => setVal("openaiEndpoint", v)
        }),
        React.createElement(Text, { style: styles.label }, "DeepL API Key"),
        React.createElement(TextInput, {
          style: styles.input,
          placeholder: "xxxx:fx",
          placeholderTextColor: "#72767D",
          secureTextEntry: true,
          autoCapitalize: "none",
          value: storage.deeplKey || "",
          onChangeText: (v) => setVal("deeplKey", v)
        })
      ),

      React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.secTitle }, "Отображение и каналы"),
        renderSwitch("Показывать оригинал", "Отображать перевод под текстом оригинала", "showOriginal"),
        renderSwitch("Переводить свои сообщения", "Переводить в том числе ваш собственный текст", "translateOwn"),
        renderSwitch("Переводить ЛС (DM)", "Работать в личных сообщениях и группах", "translateDM"),
        renderSwitch("Только в одном канале", "Переводить только в указанном ниже ID канала", "singleChannelOnly"),
        storage.singleChannelOnly
          ? React.createElement(TextInput, {
              style: styles.input,
              placeholder: "ID канала (например: 112233445566778899)",
              placeholderTextColor: "#72767D",
              keyboardType: "numeric",
              value: storage.singleChannelId || "",
              onChangeText: (v) => setVal("singleChannelId", v.trim())
            })
          : null
      ),

      React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.secTitle }, `Кэш переводов (${memoryCache.size} / 500)`),
        React.createElement(
          TouchableOpacity,
          {
            style: styles.clearBtn,
            onPress: () => {
              clearTranslationCache();
              forceUpdate();
              showToastSafe("Кэш переводов очищен");
            }
          },
          React.createElement(Text, { style: { color: "#FFF", fontWeight: "700" } }, "Очистить кэш переводов")
        )
      )
    );
  }

  // ============================================================================
  // 5. ПЕРЕХВАТ СООБЩЕНИЙ И КОМАНД
  // ============================================================================
  const unpatches = [];

  function isChannelAllowed(channelId, settings, ChannelStore) {
    if (!channelId) return true;
    if (settings.singleChannelOnly) {
      const target = (settings.singleChannelId || "").trim();
      return Boolean(target && channelId === target);
    }
    if (!settings.translateDM && ChannelStore?.getChannel) {
      const ch = ChannelStore.getChannel(channelId);
      if (ch && (ch.type === 1 || ch.type === 3)) return false;
    }
    return true;
  }

  function formatAppendedTranslation(originalText, res, showOriginal) {
    const footer = `(${res.sourceLang} → ${res.targetLang} · ${res.provider})`;
    if (!showOriginal) {
      return `🌐 ${res.text} ${footer}`;
    }
    return `${originalText}\n🌐 ${res.text} ${footer}`;
  }

  function dispatchMessageUpdate(FluxDispatcher, MessageStore, msg, newContent) {
    try {
      const existing = MessageStore?.getMessage?.(msg.channel_id, msg.id);
      const base = existing ? Object.assign({}, existing) : Object.assign({}, msg);
      base.content = newContent;
      base.channel_id = msg.channel_id;
      base.id = msg.id;
      if (msg.guild_id) base.guild_id = msg.guild_id;

      FluxDispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: base,
        __btProcessed: true
      });
    } catch (_) {}
  }

  function setupPatches() {
    const b = getBunny();
    const metro = b?.metro;
    const patcher = b?.patcher;
    if (!metro || !patcher) return;

    const FluxDispatcher = metro.common?.FluxDispatcher ?? metro.findByProps?.("dispatch", "subscribe");
    const UserStore = metro.findByStoreName?.("UserStore");
    const ChannelStore = metro.findByStoreName?.("ChannelStore");
    const MessageStore = metro.findByStoreName?.("MessageStore");

    if (FluxDispatcher) {
      // Используем patcher.instead на dispatch, чтобы для новых сообщений (MESSAGE_CREATE)
      // дождаться быстрого перевода ДО первой отрисовки нативным DCDChatManager,
      // а также параллельно обновлять через MESSAGE_UPDATE
      const unpatchDispatch = patcher.instead("dispatch", FluxDispatcher, (args, origDispatch) => {
        const event = args?.[0];
        if (!event || event.__btProcessed) {
          return origDispatch.apply(FluxDispatcher, args);
        }

        const settings = getSettings();
        if (!settings.enabled) {
          return origDispatch.apply(FluxDispatcher, args);
        }

        const currentUserId = UserStore?.getCurrentUser?.()?.id;

        // 1. Новое входящее сообщение в реальном времени
        if (event.type === "MESSAGE_CREATE" && event.message) {
          const msg = event.message;
          const chId = msg.channel_id;

          if (isChannelAllowed(chId, settings, ChannelStore) && shouldTranslateMessage(msg, currentUserId, settings)) {
            const rawText = originalContentMap.get(msg.id) || msg.content;
            originalContentMap.set(msg.id, rawText);

            const cached = getCachedTranslation(rawText, settings);
            if (cached) {
              if (!cached.skipped && cached.text) {
                event.message = Object.assign({}, msg, {
                  content: formatAppendedTranslation(rawText, cached, settings.showOriginal)
                });
              }
              event.__btProcessed = true;
              return origDispatch.apply(FluxDispatcher, args);
            }

            // Переводим асинхронно: ждём до 2500 мс, чтобы сразу отрендерить готовый перевод в нативном чате.
            // Если API отвечает дольше — сразу рендерим оригинал и досылаем MESSAGE_UPDATE по готовности.
            let dispatched = false;
            const fallbackTimer = setTimeout(() => {
              if (!dispatched) {
                dispatched = true;
                event.__btProcessed = true;
                origDispatch.call(FluxDispatcher, event);
              }
            }, 2500);

            translateText(rawText, settings)
              .then((res) => {
                clearTimeout(fallbackTimer);
                if (isUnloaded) return;
                if (!dispatched) {
                  dispatched = true;
                  if (res && !res.skipped && res.text) {
                    event.message = Object.assign({}, msg, {
                      content: formatAppendedTranslation(rawText, res, settings.showOriginal)
                    });
                  }
                  event.__btProcessed = true;
                  origDispatch.call(FluxDispatcher, event);
                } else if (res && !res.skipped && res.text) {
                  // Если оригинал уже ушёл по таймауту 2.5с — обновляем его вдогонку
                  dispatchMessageUpdate(
                    FluxDispatcher,
                    MessageStore,
                    msg,
                    formatAppendedTranslation(rawText, res, settings.showOriginal)
                  );
                }
              })
              .catch(() => {
                clearTimeout(fallbackTimer);
                if (!dispatched) {
                  dispatched = true;
                  event.__btProcessed = true;
                  origDispatch.call(FluxDispatcher, event);
                }
              });

            return;
          }
        }

        // 2. Загрузка истории сообщений при входе в канал
        if (event.type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(event.messages)) {
          const chId = event.channelId;
          if (isChannelAllowed(chId, settings, ChannelStore)) {
            const recent = event.messages.slice(0, 12);
            for (let i = 0; i < recent.length; i++) {
              const msg = recent[i];
              if (!shouldTranslateMessage(msg, currentUserId, settings)) continue;

              const rawText = originalContentMap.get(msg.id) || msg.content;
              originalContentMap.set(msg.id, rawText);

              const cached = getCachedTranslation(rawText, settings);
              if (cached && !cached.skipped && cached.text) {
                msg.content = formatAppendedTranslation(rawText, cached, settings.showOriginal);
              } else {
                translateText(rawText, settings)
                  .then((res) => {
                    if (isUnloaded || !res || res.skipped || !res.text) return;
                    dispatchMessageUpdate(
                      FluxDispatcher,
                      MessageStore,
                      msg,
                      formatAppendedTranslation(rawText, res, settings.showOriginal)
                    );
                  })
                  .catch(() => {});
              }
            }
          }
        }

        return origDispatch.apply(FluxDispatcher, args);
      });

      unpatches.push(unpatchDispatch);
    }

    // Слэш-команда /tr-lang
    if (b.commands && typeof b.commands.registerCommand === "function") {
      try {
        const unreg = b.commands.registerCommand({
          name: "tr-lang",
          displayName: "tr-lang",
          description: "Сменить целевой язык BunnyTranslate (ru, en-US, ja и т.д.)",
          displayDescription: "Сменить целевой язык BunnyTranslate (ru, en-US, ja и т.д.)",
          options: [
            {
              name: "code",
              displayName: "code",
              description: "Код языка (ru, ja, en-US, de)",
              displayDescription: "Код языка (ru, ja, en-US, de)",
              type: 3,
              required: true
            }
          ],
          applicationId: "-1",
          inputType: 1,
          type: 1,
          execute: (args) => {
            const storage = getSettings();
            const code = args?.[0]?.value?.trim();
            if (code && LANGUAGES[code]) {
              storage.targetLang = code;
              clearTranslationCache();
              showToastSafe(`Язык перевода: ${LANGUAGES[code].flag} ${LANGUAGES[code].name}`);
            } else {
              showToastSafe(`Неизвестный код языка: ${code}`);
            }
          }
        });
        if (typeof unreg === "function") unpatches.push(unreg);
      } catch (_) {}
    }
  }

  return {
    onLoad() {
      getSettings();
      initTranslatorCache();
      setupPatches();
      showToastSafe("BunnyTranslate готов к работе");
    },
    onUnload() {
      for (const u of unpatches.splice(0, unpatches.length)) {
        try {
          if (typeof u === "function") u();
        } catch (_) {}
      }
      shutdownTranslator();
    },
    settings: SettingsScreen
  };
})();
