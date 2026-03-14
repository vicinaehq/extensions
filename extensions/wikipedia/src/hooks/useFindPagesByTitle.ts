import { useEffect, useMemo, useRef, useState } from "react";

import { getApiOptions, getApiUrl, type SearchResults, type SearchResult } from "../utils/api";

export default function useFindPagesByTitle(search: string, language: string) {
  const [data, setData] = useState<{ language: string; results: SearchResult[] } | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const url = useMemo(() => {
    const url = new URL(`${getApiUrl(language)}w/api.php`);
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("format", "json");
    url.searchParams.set("srsearch", search);
    url.searchParams.set("srlimit", "9");
    return url.toString();
  }, [search, language]);

  useEffect(() => {
    if (!search) {
      setData(undefined);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);

    fetch(url, {
      headers: getApiOptions(language)?.headers as Record<string, string>,
      signal: controller.signal,
    })
      .then((res) => res.json() as Promise<SearchResults>)
      .then((json) => json?.query?.search || [])
      .then((results) => results.filter((page, index, self) => self.findIndex((p) => p.pageid === page.pageid) === index))
      .then((results) => {
        if (!controller.signal.aborted) {
          setData({ language, results });
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error("Search failed:", err);
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [url, search, language]);

  return { data, isLoading };
}
