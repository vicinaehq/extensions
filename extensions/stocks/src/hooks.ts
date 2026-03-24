import { useCallback, useEffect, useRef, useState } from "react";
import type { StockData, YahooSearchResult } from "./types";
import { fetchStockData, searchSymbols } from "./api";

const DEBOUNCE_MS = 400;

export function useStockSearch(selectedRange: string) {
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<YahooSearchResult[]>([]);
  const [searchStockData, setSearchStockData] = useState<
    Map<string, StockData>
  >(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (!searchText.trim()) {
      setSuggestions([]);
      setSearchStockData(new Map());
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      const results = await searchSymbols(searchText.trim());
      setSuggestions(results);
      setSearchStockData(new Map());

      if (results.length === 0) {
        setIsSearching(false);
        return;
      }

      // Progressive enrichment
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(false);

      for (const result of results) {
        if (controller.signal.aborted) break;

        const stockData = await fetchStockData(result.symbol, selectedRange);
        if (controller.signal.aborted) break;

        if (stockData) {
          setSearchStockData((prev) => {
            const next = new Map(prev);
            next.set(result.symbol, stockData);
            return next;
          });
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [searchText, selectedRange]);

  return {
    searchText,
    handleSearchTextChange,
    suggestions,
    searchStockData,
    isSearching,
  };
}
