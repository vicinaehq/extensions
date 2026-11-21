import { FileSearch } from "@vicinae/api";
import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./use-debounced-value.ts";
import {
  searchIndexedFiles,
  type IndexedFile,
} from "../local-packages/search.ts";
import { LatestRequest } from "../utils/latest-request.ts";

export interface IndexedFileSearchOptions {
  /** Lowercase extensions accepted from indexed results, e.g. [".json"]. */
  extensions: readonly string[];
  limitPerExtension: number;
  resultLimit: number;
}

export interface IndexedFileSearchState {
  files: IndexedFile[];
  isLoading: boolean;
  error?: string;
}

/**
 * Debounced, cancellable search of Vicinae's file index. A pasted absolute or
 * `~/` path to a regular, non-symlink file is offered regardless of its
 * extension; content inspection decides whether it is usable.
 */
export function useIndexedFileSearch(
  searchText: string,
  options: IndexedFileSearchOptions,
): IndexedFileSearchState {
  const debouncedSearchText = useDebouncedValue(searchText, 180);
  const [state, setState] = useState<IndexedFileSearchState>({
    files: [],
    isLoading: false,
  });
  const latestSearch = useRef(new LatestRequest());
  // Callers pass module-level constants, so these dependencies are stable.
  const { extensions, limitPerExtension, resultLimit } = options;

  useEffect(() => {
    const query = debouncedSearchText.trim();
    if (query !== searchText.trim() || !query) {
      latestSearch.current.cancel();
      // Still loading while a non-empty query waits for the debounce.
      setState({ files: [], isLoading: searchText.trim().length > 0 });
      return;
    }

    const request = latestSearch.current.start();
    const search = async () => {
      setState({ files: [], isLoading: true });
      try {
        const directFile = await resolveDirectFile(query);
        const files = directFile
          ? [directFile]
          : query.length < 2
          ? []
          : (await searchIndexedFiles(
            query,
            extensions,
            (extensionQuery, limit) => FileSearch.search(extensionQuery, { limit }),
            limitPerExtension,
          )).slice(0, resultLimit);
        if (request.isCurrent()) setState({ files, isLoading: false });
      } catch (error) {
        if (!request.isCurrent()) return;
        console.error("Indexed file search failed", error);
        setState({
          files: [],
          isLoading: false,
          error: "Vicinae's file search is unavailable",
        });
      }
    };

    void search();
    return () => latestSearch.current.cancel();
  }, [debouncedSearchText, searchText, extensions, limitPerExtension, resultLimit]);

  return state;
}

async function resolveDirectFile(query: string): Promise<IndexedFile | undefined> {
  const filePath = query.startsWith("/")
    ? query
    : query.startsWith("~/")
    ? join(homedir(), query.slice(2))
    : undefined;
  if (!filePath) return undefined;
  try {
    const stat = await lstat(filePath);
    if (stat.isFile() && !stat.isSymbolicLink()) return { path: filePath };
  } catch {
    // Fall back to indexed search when a pasted path does not exist.
  }
  return undefined;
}
