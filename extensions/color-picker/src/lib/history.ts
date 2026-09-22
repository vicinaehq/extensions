import { Cache } from "@vicinae/api";
import { useEffect, useState } from "react";
import type { HistoryColor, HistoryItem } from "./types";
import { getFormattedColor } from "./utils";

const MAX_HISTORY_LENGTH = 200;
const cache = new Cache();

export function getHistory(): HistoryItem[] {
  const data = cache.get("history");
  if (!data) return [];
  try {
    return JSON.parse(data) as HistoryItem[];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  cache.set("history", JSON.stringify(items));
}

export function addToHistory(color: HistoryColor, options?: { isFavorite?: boolean }) {
  const previousHistory = getHistory();
  const colorKey = getFormattedColor(color);
  const previousHistoryItem = previousHistory.find((item) => getFormattedColor(item.color) === colorKey);

  const historyItem: HistoryItem = {
    date: new Date().toISOString(),
    color,
    title: previousHistoryItem?.title,
    isFavorite: options?.isFavorite ?? previousHistoryItem?.isFavorite,
  };

  const history = previousHistoryItem?.isFavorite
    ? previousHistory.map((item) => (getFormattedColor(item.color) === colorKey ? historyItem : item))
    : [historyItem, ...previousHistory.filter((item) => getFormattedColor(item.color) !== colorKey)];

  const persistentItemsCount = history.filter((item) => item.isFavorite).length;
  const maxRegularHistoryLength = Math.max(MAX_HISTORY_LENGTH - persistentItemsCount, 0);
  let regularHistoryCount = 0;
  const newHistory = history.filter((item) => {
    if (item.isFavorite) return true;
    regularHistoryCount += 1;
    return regularHistoryCount <= maxRegularHistoryLength;
  });

  saveHistory(newHistory);
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>(() => getHistory());

  useEffect(() => {
    setHistory(getHistory());
    const unsubscribe = cache.subscribe((key, data) => {
      if (key === "history") {
        try {
          setHistory(data ? JSON.parse(data) : []);
        } catch {
          setHistory([]);
        }
      }
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const update = (color: HistoryColor, updateItem: (item: HistoryItem) => HistoryItem) => {
    const next = history.map((item) =>
      getFormattedColor(item.color) === getFormattedColor(color) ? updateItem(item) : item,
    );
    saveHistory(next);
  };

  return {
    history,
    remove: (color: HistoryColor) => {
      const next = history.filter((item) => getFormattedColor(item.color) !== getFormattedColor(color));
      saveHistory(next);
    },
    edit: (historyItem: HistoryItem) => {
      const next = history.map((item) =>
        getFormattedColor(item.color) === getFormattedColor(historyItem.color) ? historyItem : item,
      );
      saveHistory(next);
    },
    addToFavorites: (color: HistoryColor) => update(color, (item) => ({ ...item, isFavorite: true })),
    removeFromFavorites: (color: HistoryColor) => update(color, (item) => ({ ...item, isFavorite: false })),
    moveFavorite: (color: HistoryColor, direction: "up" | "down") => {
      const colorKey = getFormattedColor(color);
      const currentIndex = history.findIndex(
        (item) => item.isFavorite && getFormattedColor(item.color) === colorKey,
      );
      if (currentIndex === -1) return;

      const favoriteIndexes = history.reduce<number[]>((indexes, item, index) => {
        if (item.isFavorite) indexes.push(index);
        return indexes;
      }, []);
      const favoriteIndex = favoriteIndexes.indexOf(currentIndex);
      const targetFavoriteIndex = favoriteIndex + (direction === "up" ? -1 : 1);
      const targetIndex = favoriteIndexes[targetFavoriteIndex];
      if (targetIndex === undefined) return;

      const nextHistory = [...history];
      [nextHistory[currentIndex], nextHistory[targetIndex]] = [nextHistory[targetIndex], nextHistory[currentIndex]];
      saveHistory(nextHistory);
    },
    clear: () => saveHistory([]),
  };
}
