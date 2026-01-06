import { useState, useEffect, useCallback } from "react";
import { LocalStorage } from "@raycast/api";

const RECENT_KEY = "fmhy_recent";
const MAX_RECENT = 20;

export function useRecent() {
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadRecent() {
      try {
        const item = await LocalStorage.getItem<string>(RECENT_KEY);
        if (item) {
          setRecentIds(JSON.parse(item));
        }
      } catch (error) {
        console.error("Failed to load recent links:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadRecent();
  }, []);

  const addToRecent = useCallback(async (linkId: string) => {
    setRecentIds((prev) => {
      const newRecent = [linkId, ...prev.filter((id) => id !== linkId)].slice(0, MAX_RECENT);
      LocalStorage.setItem(RECENT_KEY, JSON.stringify(newRecent));
      return newRecent;
    });
  }, []);

  const clearRecent = useCallback(async () => {
    await LocalStorage.removeItem(RECENT_KEY);
    setRecentIds([]);
  }, []);

  return { recentIds, addToRecent, clearRecent, isLoading };
}
