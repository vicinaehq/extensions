import { useState, useCallback, useRef } from "react";
import { showToast, Toast } from "@vicinae/api";

export function useSearch<T>(searchFunction: (query: string) => Promise<T[]>, errorMessage: string = "Search failed") {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setItems([]);
        return;
      }

      setIsLoading(true);
      try {
        const results = await searchFunction(query);
        setItems(results);
      } catch (error) {
        console.error("Search failed:", error);
        showToast({
          style: Toast.Style.Failure,
          title: "Search failed",
          message: errorMessage,
        });
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    },
    [searchFunction, errorMessage],
  );

  const handleSearchTextChange = useCallback(
    (text: string) => {
      setSearchText(text);

      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout with 500ms delay
      timeoutRef.current = setTimeout(() => {
        performSearch(text);
        timeoutRef.current = null;
      }, 500);
    },
    [performSearch],
  );

  return {
    items,
    isLoading,
    searchText,
    handleSearchTextChange,
  };
}
