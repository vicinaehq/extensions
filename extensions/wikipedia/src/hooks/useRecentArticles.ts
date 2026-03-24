import { Cache } from "@vicinae/api";
import { useCallback, useState } from "react";

import { type Locale } from "../utils/language";

import { useLanguage } from "./useLanguage";

const cache = new Cache();

type RecentsMap = Partial<Record<Locale, string[]>>;

function getStoredRecents(): RecentsMap {
  const stored = cache.get("recentArticles");
  return stored ? (JSON.parse(stored) as RecentsMap) : {};
}

function setStoredRecents(recents: RecentsMap) {
  cache.set("recentArticles", JSON.stringify(recents));
}

export function useRecentArticles() {
  const [language] = useLanguage();
  const [readArticles, setReadArticles] = useState<RecentsMap>(getStoredRecents);

  const updateRecents = useCallback((updater: (prev: RecentsMap) => RecentsMap) => {
    setReadArticles((prev) => {
      const next = updater(prev);
      setStoredRecents(next);
      return next;
    });
  }, []);

  const addToReadArticles = useCallback(
    ({ title, language }: { title: string; language: Locale }) => {
      updateRecents((r) => ({
        ...r,
        [language]: [title, ...(r[language] ?? []).filter((a) => a !== title)].slice(0, 20),
      }));
    },
    [updateRecents],
  );

  const removeFromReadArticles = useCallback(
    ({ title, language }: { title: string; language: Locale }) => {
      updateRecents((r) => ({
        ...r,
        [language]: (r[language] ?? []).filter((a) => a !== title),
      }));
    },
    [updateRecents],
  );

  const clearReadArticles = useCallback(() => {
    updateRecents(() => ({}));
  }, [updateRecents]);

  return {
    readArticles: readArticles[language] ?? [],
    addToReadArticles,
    removeFromReadArticles,
    clearReadArticles,
  };
}
