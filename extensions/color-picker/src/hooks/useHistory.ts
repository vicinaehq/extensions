import { LocalStorage, environment } from "@vicinae/api";
import { useState, useEffect } from "react";
import { HistoryColor, HistoryItem } from "@/types";
import { getFormattedColor } from "@/utils/color-formatter";
import * as fs from "fs/promises";
import * as path from "path";

const MAX_HISTORY_LENGTH = 200;
const HISTORY_KEY = "color-history";

// Get the history file path
function getHistoryFilePath(): string {
  const dataDir = environment.supportPath;
  return path.join(dataDir, "color-history.json");
}

// Helper to load history from file (async)
async function loadHistoryFromStorage(): Promise<HistoryItem[]> {
  try {
    const filePath = getHistoryFilePath();
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return []; // File doesn't exist yet
    }
    console.error("[loadHistoryFromStorage] Error loading from storage:", error);
    return []; // Return empty array if storage is corrupted
  }
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history on mount
  useEffect(() => {
    loadHistoryFromStorage().then(setHistory);
  }, []);

  return {
    history,
    remove: async (color: HistoryColor) => {
      const currentHistory = await loadHistoryFromStorage();
      const newHistory = currentHistory.filter((item) => getFormattedColor(item.color) !== getFormattedColor(color));
      await fs.writeFile(getHistoryFilePath(), JSON.stringify(newHistory, null, 2), "utf-8");
      setHistory(newHistory);
    },
    edit: async (historyItem: HistoryItem) => {
      const currentHistory = await loadHistoryFromStorage();
      const newHistory = currentHistory.map((item) =>
        getFormattedColor(item.color) === getFormattedColor(historyItem.color) ? historyItem : item
      );
      await fs.writeFile(getHistoryFilePath(), JSON.stringify(newHistory, null, 2), "utf-8");
      setHistory(newHistory);
    },
    clear: async () => {
      await fs.writeFile(getHistoryFilePath(), JSON.stringify([]), "utf-8");
      setHistory([]);
    },
  };
}

export async function addToHistory(color: HistoryColor) {
  try {
    const filePath = getHistoryFilePath();
    const previousHistory = await loadHistoryFromStorage();

    const historyItem: HistoryItem = { date: new Date().toISOString(), color };
    const newHistory = [
      historyItem,
      ...previousHistory.filter((item) => getFormattedColor(item.color) !== getFormattedColor(color)),
    ].slice(0, MAX_HISTORY_LENGTH);

    await fs.writeFile(filePath, JSON.stringify(newHistory, null, 2), "utf-8");
  } catch (error) {
    console.error("[addToHistory] Error:", error);
    throw error;
  }
}
