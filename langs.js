// langs.js — Конфигурация языков, стилей перевода и локальной эвристики определения языка

export const LANGUAGES = {
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

export const STYLES = {
  literal: {
    id: "literal",
    label: "Literal (Дословно)",
    description: "Точный перевод близко к тексту оригинала без отсебятины."
  },
  native: {
    id: "native",
    label: "Native (Носитель)",
    description: "Естественная живая речь носителя языка с адаптацией идиом."
  },
  slang: {
    id: "slang",
    label: "Slang (Сленг / Мемы / 18+)",
    description: "Максимально живой интернет-сленг, мемы, мат и эмодзи."
  }
};

export const PROVIDERS = {
  auto: { id: "auto", label: "Авто (OpenAI -> DeepL -> Google)" },
  openai: { id: "openai", label: "OpenAI / Совместимый LLM" },
  deepl: { id: "deepl", label: "DeepL API" },
  google: { id: "google", label: "Google Translate (Бесплатно)" }
};

/**
 * Генерация системного промпта для LLM в зависимости от выбранного стиля и языка
 */
export function buildSystemPrompt(langCode, styleId) {
  const langObj = LANGUAGES[langCode] || { name: langCode };
  const langName = `${langObj.name} (${langCode})`;  if (styleId === "literal") { return `Ты — профессиональный переводчик на ${langName}. Переведи сообщение максимально точно и дословно, сохраняя структуру, эмодзи и форматирование Discord. Не добавляй ничего от себя, возвращай только перевод.`;
  }

  if (styleId === "native") {
    return `Ты — носитель языка ${langName}. Переведи сообщение естественно, как говорят в повседневной жизни и чатах, адаптируя идиомы и сохраняя эмодзи и тон оригинала. Не добавляй ничего от себя, возвращай только готовый перевод.`; }  // Режим slang (по умолчанию для продвинутого перевода) return `Ты — носитель ${langName}. Переведи так, как реально говорят в интернете. Сохраняй сленг, мат, эмодзи. Непереводимое — оригинал + пояснение в скобках (сленг: ...). Не добавляй ничего от себя.`;
}

/**
 * Быстрая локальная эвристика определения языка по Unicode-диапазонам.
 * Позволяет мгновенно отсечь перевод, если сообщение уже на целевом языке,
 * либо передать предварительный код до ответа API.
 */
export function detectLanguageHeuristic(text) {
  if (!text) return null;
  // Убираем URL, упоминания, кастомные эмодзи Discord и цифры
  const clean = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<@!?\d+>|<#\d+>|<@&\d+>/g, "")
    .replace(/[\d\s\p{P}\p{S}]/gu, "");

  if (!clean) return null;

  // Японский: Хирагана / Катакана
  if (/[\u3040-\u30ff]/.test(clean)) return "ja";
  // Корейский: Хангыль
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(clean)) return "ko";
  // Китайский: CJK иероглифы (если нет каны)
  if (/[\u4e00-\u9fff]/.test(clean)) return "zh";
  // Иврит
  if (/[\u0590-\u05ff]/.test(clean)) return "he";
  // Арабский
  if (/[\u0600-\u06ff]/.test(clean)) return "ar";
  // Тайский
  if (/[\u0e00-\u0e7f]/.test(clean)) return "th";
  // Хинди (Деванагари)
  if (/[\u0900-\u097f]/.test(clean)) return "hi";
  // Греческий
  if (/[\u0370-\u03ff]/.test(clean)) return "el";

  // Кириллица: различаем украинский и русский по специфичным буквам
  if (/[\u0400-\u04ff]/.test(clean)) {
    if (/[іїєґІЇЄҐ]/.test(clean)) return "uk";
    return "ru";
  }

  // Латиница с характерной диакритикой
  if (/[ăâîșțĂÂÎȘȚ]/.test(clean)) return "ro";
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(clean)) return "pl";
  if (/[ěščřžýáíéúůďťňĚŠČŘŽÝÁÍÉÚŮĎŤŇ]/.test(clean)) return "cs";
  if (/[őűŐŰ]/.test(clean)) return "hu";
  if (/[ğışçöüĞİŞÇÖÜ]/.test(clean)) return "tr";
  if (/[ăâđêôơưĂÂĐÊÔƠƯ]|[ảẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(clean)) return "vi";
  if (/[äöüßÄÖÜ]/.test(clean) && /\b(der|die|das|und|ist|nicht|ich|du)\b/i.test(text)) return "de";
  if (/[ñáéíóúü¿¡]/i.test(clean) && /\b(el|la|que|de|en|un|por|para|con|no|es)\b/i.test(text)) return "es";
  if (/[ãõçáéíóúâêô]/i.test(clean) && /\b(não|que|para|com|uma|por|mais|como)\b/i.test(text)) return "pt";
  if (/[éèêëàâùûüîïôœç]/i.test(clean) && /\b(le|la|les|des|est|pas|une|dans|pour|que)\b/i.test(text)) return "fr";

  return null;
}

/**
 * Сравнение базовых языковых кодов (например, "en" === "en-US" -> true)
 */
export function isSameLanguage(sourceLang, targetLang) {
  if (!sourceLang || !targetLang) return false;
  const s = sourceLang.toLowerCase().split("-")[0];
  const t = targetLang.toLowerCase().split("-")[0];
  // Исключение для китайского: zh-CN и zh-TW имеют разную письменность
  if (s === "zh" && t === "zh") {
    return sourceLang.toLowerCase() === targetLang.toLowerCase();
  }
  // Исключение для португальского и испанского — если пользователь хочет именно локальный диалект,
  // но базово считаем один язык совпадением, чтобы не переводить английский на английский
  return s === t;
}
