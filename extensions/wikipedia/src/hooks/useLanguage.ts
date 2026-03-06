import { Cache } from "@vicinae/api";
import { useCallback, useState } from "react";

import { type Locale } from "../utils/language";

const cache = new Cache();

export function useLanguage(): [Locale, (locale: Locale) => void] {
  const [language, setLanguageState] = useState<Locale>(() => {
    const stored = cache.get("language");
    return stored ? (JSON.parse(stored) as Locale) : "en";
  });

  const setLanguage = useCallback((locale: Locale) => {
    setLanguageState(locale);
    cache.set("language", JSON.stringify(locale));
  }, []);

  return [language, setLanguage];
}
