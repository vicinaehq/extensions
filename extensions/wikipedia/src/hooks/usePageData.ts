import { popToRoot, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import wiki from "wikijs";

import { getApiOptions, getApiUrl, type PageMetadata, type PageSummary, type WikiNode } from "../utils/api";

function useFetchData<T>(fetcher: () => Promise<T>, deps: unknown[], onError?: (error: Error) => void) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setIsLoading(false);
          onError?.(err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return { data, isLoading };
}

export function usePageSummary(title: string, language: string, onError?: (error: Error) => void) {
  return useFetchData<PageSummary>(
    () =>
      fetch(
        `${getApiUrl(language)}api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: getApiOptions(language)?.headers as Record<string, string> },
      ).then((res) => res.json() as Promise<PageSummary>),
    [title, language],
    onError,
  );
}

function usePageContent(title: string, language: string) {
  return useFetchData<WikiNode[]>(
    () =>
      wiki({
        apiUrl: `${getApiUrl(language)}w/api.php`,
        headers: getApiOptions(language)?.headers,
      })
        .page(title)
        .then((page) => page.content() as unknown as WikiNode[])
        .catch(() => []),
    [title, language],
  );
}

function usePageMetadata(title: string, language: string) {
  return useFetchData<PageMetadata>(
    () =>
      wiki({
        apiUrl: `${getApiUrl(language)}w/api.php`,
        headers: getApiOptions(language)?.headers,
      })
        .page(title)
        .then((page) => page.fullInfo() as Promise<{ general?: PageMetadata }>)
        .then((data) => (data.general ?? {}) as PageMetadata)
        .catch(() => ({})),
    [title, language],
  );
}

function usePageLinks(title: string, language: string) {
  return useFetchData<string[]>(
    () =>
      wiki({
        apiUrl: `${getApiUrl(language)}w/api.php`,
        headers: getApiOptions(language)?.headers,
      })
        .page(title)
        .then((page) => page.links())
        .catch(() => [] as string[]),
    [title, language],
  );
}

export function useAvailableLanguages(title: string, language: string) {
  return useFetchData<Array<{ lang: string; title: string }>>(
    () =>
      wiki({
        apiUrl: `${getApiUrl(language)}w/api.php`,
        headers: getApiOptions(language)?.headers,
      })
        .page(title)
        .then((page) => page.langlinks())
        .catch(() => [{ lang: language, title }]),
    [title, language],
  );
}

export function usePageData(title: string, language: string) {
  const { data: page, isLoading: isLoadingPage } = usePageSummary(title, language, () => {
    showToast({
      title: "Page not found",
      message: title,
      style: Toast.Style.Failure,
    });
    popToRoot();
  });
  const { data: content, isLoading: isLoadingContent } = usePageContent(title, language);
  const { data: metadata, isLoading: isLoadingMetadata } = usePageMetadata(title, language);
  const { data: links, isLoading: isLoadingLinks } = usePageLinks(title, language);

  const isLoading = isLoadingPage || isLoadingContent || isLoadingMetadata || isLoadingLinks;

  return { page, content, metadata, links, isLoading };
}
