(function () {
  const getBunny = () => globalThis.bunny || globalThis.vendetta || window.bunny || window.vendetta || {};

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
    const s = b.storage || {};
    for (const k in DEFAULT_SETTINGS) {
      if (s[k] === undefined) s[k] = DEFAULT_SETTINGS[k];
    }
    return s;
  }

  function showToast(msg) {
    const b = getBunny();
    const fn = (b.ui && b.ui.toasts && b.ui.toasts.showToast) || (b.ui && b.ui.showToast);
    if (typeof fn === "function") {
      try { fn(msg); } catch (e) {}
    }
  }

  const memoryCache = new Map();
  const originalContentMap = new Map();
  const unpatches = [];
  let isUnloaded = false;

  function isSameLanguage(src, tgt) {
    if (!src || !tgt) return false;
    const s = src.toLowerCase().split("-")[0];
    const t = tgt.toLowerCase().split("-")[0];
    if (s === "zh" && t === "zh") return src.toLowerCase() === tgt.toLowerCase();
    return s === t;
  }

  async function translateViaGoogle(text, targetLang) {
    let tl = targetLang;
    if (targetLang.indexOf("en-") === 0) tl = "en";
    else if (targetLang.indexOf("es-") === 0) tl = "es";
    else if (targetLang === "he") tl = "iw";

    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
      encodeURIComponent(tl) + "&dt=t&dj=1&q=" + encodeURIComponent(text);

    const res = await fetch(url);
    if (!res.ok) throw new Error("Google HTTP " + res.status);
    const data = await res.json();
    const detected = (data && data.src ? data.src : "auto").toLowerCase();

    if (isSameLanguage(detected, targetLang)) {
      return { skipped: true, sourceLang: detected };
    }

    const out = Array.isArray(data && data.sentences)
      ? data.sentences.map(function (s) { return s.trans || ""; }).join("").trim()
      : "";

    if (!out) throw new Error("Empty response");
    return {
      text: out,
      sourceLang: detected.toUpperCase(),
      targetLang: targetLang,
      provider: "Google"
    };
  }

  async function translateViaOpenAI(text, targetLang, styleId, settings) {
    const apiKey = (settings.openaiKey || "").trim();
    const baseUrl = (settings.openaiEndpoint || "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = (settings.openaiModel || "gpt-4o-mini").trim();
    if (!apiKey && baseUrl === "https://api.openai.com/v1") throw new Error("No OpenAI key");

    const langObj = LANGUAGES[targetLang] || { name: targetLang };
    const prompt = styleId === "literal"
      ? "Переведи максимально дословно на " + langObj.name + " (" + targetLang + "). Без отсебятины."
      : "Ты — носитель " + langObj.name + " (" + targetLang + "). Переведи так, как реально говорят в интернете. Сохраняй сленг, мат, эмодзи. Непереводимое — оригинал + пояснение в скобках. Не добавляй ничего от себя.";

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = "Bearer " + apiKey;

    const res = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: model,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text }
        ]
      })
    });

    if (!res.ok) throw new Error("OpenAI HTTP " + res.status);
    const data = await res.json();
    const out = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "";
    if (!out) throw new Error("Empty OpenAI");

    return {
      text: out,
      sourceLang: "AUTO",
      targetLang: targetLang,
      provider: "OpenAI"
    };
  }

  async function translateViaDeepL(text, targetLang, settings) {
    const apiKey = (settings.deeplKey || "").trim();
    if (!apiKey) throw new Error("No DeepL key");
    const endpoint = apiKey.slice(-3) === ":fx"
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";

    let dlTarget = targetLang.toUpperCase();
    if (dlTarget.indexOf("EN-") === 0 && dlTarget !== "EN-US" && dlTarget !== "EN-GB") dlTarget = "EN-US";
    else if (dlTarget.indexOf("ES-") === 0) dlTarget = "ES";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": "DeepL-Auth-Key " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: [text], target_lang: dlTarget })
    });

    if (!res.ok) throw new Error("DeepL HTTP " + res.status);
    const data = await res.json();
    const item = data && data.translations && data.translations[0];
    if (!item || !item.text) throw new Error("Empty DeepL");

    const src = (item.detected_source_language || "auto").toLowerCase();
    if (isSameLanguage(src, targetLang)) return { skipped: true, sourceLang: src };

    return {
      text: item.text,
      sourceLang: src.toUpperCase(),
      targetLang: targetLang,
      provider: "DeepL"
    };
  }

  async function translateText(text, settings) {
    const key = settings.targetLang + "|" + settings.style + "|" + settings.provider + "|" + text;
    if (memoryCache.has(key)) return memoryCache.get(key);

    const p = settings.provider || "auto";
    const chain = p === "google" ? ["google"] : p === "deepl" ? ["deepl", "google"] : ["openai", "deepl", "google"];

    for (let i = 0; i < chain.length; i++) {
      const prov = chain[i];
      try {
        let res = null;
        if (prov === "openai") res = await translateViaOpenAI(text, settings.targetLang, settings.style, settings);
        else if (prov === "deepl") res = await translateViaDeepL(text, settings.targetLang, settings);
        else res = await translateViaGoogle(text, settings.targetLang);

        if (res) {
          if (!res.skipped && res.text.trim().toLowerCase() === text.trim().toLowerCase()) {
            res = { skipped: true, sourceLang: res.sourceLang };
          }
          memoryCache.set(key, res);
          return res;
        }
      } catch (e) {}
    }
    return null;
  }

  function shouldTranslate(msg, currentUserId, settings) {
    if (!msg || typeof msg.content !== "string") return false;
    if (msg.content.indexOf("\n🌐 ") !== -1 || msg.content.indexOf("🌐 ") === 0) return false;
    if (msg.author && msg.author.bot) return false;
    if (!settings.translateOwn && currentUserId && msg.author && msg.author.id === currentUserId) return false;
    const clean = msg.content.replace(/https?:\/\/\S+/g, "").replace(/<a?:\w+:\d+>/g, "").trim();
    return clean.length >= 2;
  }

  function formatMsg(orig, res, showOrig) {
    const footer = "[" + res.sourceLang + " → " + res.targetLang + " · " + res.provider + "]";
    if (!showOrig) return "🌐 " + res.text + "\n-# " + footer;
    return orig + "\n🌐 " + res.text + "\n-# " + footer;
  }

  function setupPatches() {
    const b = getBunny();
    const metro = b.metro;
    const patcher = b.patcher;
    if (!metro || !patcher) return;

    const FluxDispatcher = (metro.common && metro.common.FluxDispatcher) || (metro.findByProps && metro.findByProps("dispatch", "subscribe"));
    const UserStore = metro.findByStoreName ? metro.findByStoreName("UserStore") : null;

    if (FluxDispatcher) {
      const unpatch = patcher.before("dispatch", FluxDispatcher, function (args) {
        try {
          const ev = args && args[0];
          if (!ev || ev.__btDone) return;
          const settings = getSettings();
          if (!settings.enabled) return;

          const myId = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser() ? UserStore.getCurrentUser().id : null;

          if (ev.type === "MESSAGE_CREATE" && ev.message) {
            const msg = ev.message;
            if (!shouldTranslate(msg, myId, settings)) return;

            const raw = originalContentMap.get(msg.id) || msg.content;
            originalContentMap.set(msg.id, raw);

            translateText(raw, settings).then(function (res) {
              if (isUnloaded || !res || res.skipped || !res.text) return;
              FluxDispatcher.dispatch({
                type: "MESSAGE_UPDATE",
                message: Object.assign({}, msg, {
                  content: formatMsg(raw, res, settings.showOriginal)
                }),
                __btDone: true
              });
            });
          }
        } catch (e) {}
      });
      unpatches.push(unpatch);
    }
  }

  function SettingsScreen() {
    const b = getBunny();
    const React = (b.metro && b.metro.common && b.metro.common.React) || globalThis.React;
    const RN = (b.metro && b.metro.common && b.metro.common.ReactNative) || {};
    const s = getSettings();
    const [, forceUpdate] = React.useReducer(function (x) { return x + 1; }, 0);
    const [openLangs, setOpenLangs] = React.useState(false);

    const setVal = function (k, v) {
      s[k] = v;
      forceUpdate();
    };

    const { ScrollView, View, Text, TextInput, TouchableOpacity, Switch } = RN;
    const cur = LANGUAGES[s.targetLang] || LANGUAGES["ru"];

    return React.createElement(
      ScrollView,
      { style: { flex: 1, padding: 14 } },
      React.createElement(
        View,
        { style: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 14, marginBottom: 14 } },
        React.createElement(
          View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          React.createElement(Text, { style: { color: "#FFF", fontSize: 16, fontWeight: "600" } }, "Включить автоперевод"),
          React.createElement(Switch, { value: Boolean(s.enabled), onValueChange: function (v) { setVal("enabled", v); } })
        ),
        React.createElement(
          View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          React.createElement(Text, { style: { color: "#FFF", fontSize: 15 } }, "Показывать оригинал"),
          React.createElement(Switch, { value: Boolean(s.showOriginal), onValueChange: function (v) { setVal("showOriginal", v); } })
        ),
        React.createElement(
          View,
          { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          React.createElement(Text, { style: { color: "#FFF", fontSize: 15 } }, "Переводить свои сообщения"),
          React.createElement(Switch, { value: Boolean(s.translateOwn), onValueChange: function (v) { setVal("translateOwn", v); } })
        ),
        React.createElement(
          TouchableOpacity,
          {
            style: { backgroundColor: "rgba(0,0,0,0.35)", padding: 12, borderRadius: 8, marginTop: 6 },
            onPress: function () { setOpenLangs(!openLangs); }
          },
          React.createElement(Text, { style: { color: "#FFF", fontSize: 15 } }, "Язык: " + cur.flag + " " + cur.name + " (" + cur.code + ")")
        ),
        openLangs
          ? React.createElement(
              View,
              { style: { marginTop: 8 } },
              Object.keys(LANGUAGES).map(function (code) {
                const l = LANGUAGES[code];
                return React.createElement(
                  TouchableOpacity,
                  {
                    key: code,
                    style: { padding: 8, backgroundColor: s.targetLang === code ? "#5865F2" : "transparent", borderRadius: 6 },
                    onPress: function () {
                      setVal("targetLang", code);
                      setOpenLangs(false);
                    }
                  },
                  React.createElement(Text, { style: { color: "#FFF" } }, l.flag + " " + l.name + " (" + l.code + ")")
                );
              })
            )
          : null,
        React.createElement(Text, { style: { color: "#B5BAC1", marginTop: 12 } }, "OpenAI API Key (для сленга):"),
        React.createElement(TextInput, {
          style: { backgroundColor: "rgba(0,0,0,0.35)", color: "#FFF", padding: 10, borderRadius: 8, marginTop: 4 },
          placeholder: "sk-...",
          placeholderTextColor: "#72767D",
          secureTextEntry: true,
          value: s.openaiKey || "",
          onChangeText: function (v) { setVal("openaiKey", v); }
        }),
        React.createElement(Text, { style: { color: "#B5BAC1", marginTop: 10 } }, "DeepL API Key:"),
        React.createElement(TextInput, {
          style: { backgroundColor: "rgba(0,0,0,0.35)", color: "#FFF", padding: 10, borderRadius: 8, marginTop: 4 },
          placeholder: "xxxx:fx",
          placeholderTextColor: "#72767D",
          secureTextEntry: true,
          value: s.deeplKey || "",
          onChangeText: function (v) { setVal("deeplKey", v); }
        })
      )
    );
  }

  return {
    onLoad: function () {
      isUnloaded = false;
      getSettings();
      setupPatches();
      showToast("BunnyTranslate запущен!");
    },
    onUnload: function () {
      isUnloaded = true;
      while (unpatches.length > 0) {
        const u = unpatches.pop();
        if (typeof u === "function") {
          try { u(); } catch (e) {}
        }
      }
    },
    settings: SettingsScreen
  };
})();

