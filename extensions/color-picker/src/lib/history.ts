import { LocalStorage } from "@vicinae/api";
import { useEffect, useState } from "react";
import type { HistoryColor, HistoryItem } from "./types";
import { getFormattedColor } from "./utils";

const MAX_HISTORY_LENGTH = 200;
const STORAGE_KEY = "history";

let inMemoryHistory: HistoryItem[] | null = null;
const listeners = new Set<(items: HistoryItem[]) => void>();

export async function getHistory(): Promise<HistoryItem[]> {
  if (inMemoryHistory !== null) {
    return inMemoryHistory;
  }
  try {
    const data = await LocalStorage.getItem<string>(STORAGE_KEY);
    if (!data) {
      inMemoryHistory = [];
      return [];
    }
    inMemoryHistory = JSON.parse(data) as HistoryItem[];
    return inMemoryHistory;
  } catch (error) {
    console.error("Failed to read history from LocalStorage:", error);
    inMemoryHistory = [];
    return [];
  }
}

export async function saveHistory(items: HistoryItem[]): Promise<void> {
  inMemoryHistory = items;
  try {
    await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error("Failed to persist history to LocalStorage:", error);
  }
  listeners.forEach((listener) => listener(items));
}

export async function addToHistory(color: HistoryColor, options?: { isFavorite?: boolean }) {
  const previousHistory = await getHistory();
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

  await saveHistory(newHistory);
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>(() => inMemoryHistory ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(inMemoryHistory === null);

  useEffect(() => {
    let isMounted = true;

    getHistory().then((items) => {
      if (isMounted) {
        setHistory(items);
        setIsLoading(false);
      }
    });

    const listener = (newHistory: HistoryItem[]) => {
      if (isMounted) {
        setHistory(newHistory);
      }
    };
    listeners.add(listener);

    return () => {
      isMounted = false;
      listeners.delete(listener);
    };
  }, []);

  const update = (color: HistoryColor, updateItem: (item: HistoryItem) => HistoryItem) => {
    const next = history.map((item) =>
      getFormattedColor(item.color) === getFormattedColor(color) ? updateItem(item) : item,
    );
    void saveHistory(next);
  };

  return {
    history,
    isLoading,
    remove: (color: HistoryColor) => {
      const next = history.filter((item) => getFormattedColor(item.color) !== getFormattedColor(color));
      void saveHistory(next);
    },
    edit: (historyItem: HistoryItem) => {
      const next = history.map((item) =>
        getFormattedColor(item.color) === getFormattedColor(historyItem.color) ? historyItem : item,
      );
      void saveHistory(next);
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
      void saveHistory(nextHistory);
    },
    clear: () => void saveHistory([]),
  };
}
