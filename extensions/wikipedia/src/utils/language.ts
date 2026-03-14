import { Cache } from "@vicinae/api";

export const languages = [
  { icon: "🇺🇸", title: "English", value: "en" },
  { icon: "🇺🇸", title: "English (Simple)", value: "simple" },
  { icon: "🇪🇸", title: "Spanish", value: "es" },
  { icon: "🇩🇪", title: "German", value: "de" },
  { icon: "🇫🇷", title: "French", value: "fr" },
  { icon: "🇯🇵", title: "Japanese", value: "ja" },
  { icon: "🇷🇺", title: "Russian", value: "ru" },
  { icon: "🇵🇹", title: "Portuguese", value: "pt" },
  { icon: "🇮🇹", title: "Italian", value: "it" },
  { icon: "🇮🇷", title: "Persian", value: "fa" },
  { icon: "🇦🇪", title: "Arabic", value: "ar" },
  { icon: "🇵🇱", title: "Polish", value: "pl" },
  { icon: "🇳🇱", title: "Dutch", value: "nl" },
  { icon: "🇹🇷", title: "Turkish", value: "tr" },
  { icon: "🇬🇷", title: "Greek", value: "el" },
  { icon: "🇺🇦", title: "Ukrainian", value: "uk" },
  { icon: "🇨🇳", title: "Chinese (Simplified)", value: "zh" },
  { icon: "🇭🇰", title: "Chinese (Hong Kong)", value: "zh-hk" },
  { icon: "🇲🇴", title: "Chinese (Macau)", value: "zh-mo" },
  { icon: "🇲🇾", title: "Chinese (Malaysia)", value: "zh-my" },
  { icon: "🇸🇬", title: "Chinese (Singapore)", value: "zh-sg" },
  { icon: "🇹🇼", title: "Chinese (Taiwan)", value: "zh-tw" },
  { icon: "🇨🇳", title: "Chinese (China)", value: "zh-cn" },
  { icon: "🇩🇰", title: "Danish", value: "da" },
  { icon: "🇫🇮", title: "Finnish", value: "fi" },
  { icon: "🇸🇪", title: "Swedish", value: "sv" },
  { icon: "🇳🇴", title: "Norwegian", value: "no" },
  { icon: "🇦🇩", title: "Catalan", value: "ca" },
  { icon: "🇪🇸", title: "Basque", value: "eu" },
  { icon: "🇪🇸", title: "Galician", value: "gl" },
  { icon: "🇫🇷", title: "Occitan", value: "oc" },
  { icon: "🇪🇸", title: "Aragonese", value: "an" },
  { icon: "🇪🇸", title: "Asturian", value: "ast" },
] as const;

export type Locale = (typeof languages)[number]["value"];

const cache = new Cache();

export function getStoredLanguage(): Locale {
  const stored = cache.get("language");
  return stored ? (JSON.parse(stored) as Locale) : "en";
}
