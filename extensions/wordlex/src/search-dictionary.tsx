/**
 * Search Dictionary — Primary view command for the WordLex Vicinae extension.
 *
 * Renders a searchable List with an inline Detail pane. The user types a word,
 * prefix search results appear on the left, and the full definition is rendered
 * as markdown on the right when an item is selected.
 *
 * Data flow:
 * 1. onSearchTextChange → debounced `wordlex --search-json <prefix>` (async)
 * 2. User highlights an item → `wordlex --cli-json <word>` → markdown detail
 * 3. Actions: copy definition, paste word, open in WordLex GUI, open on Wiktionary
 *
 * Detail rendering strategy:
 * - A ref-based cache stores loaded WordDetail objects keyed by word.
 * - A version counter state forces re-renders when new entries are added.
 * - Each List.Item reads its own detail from the cache — no single
 *   `selectedDetail` bottleneck that only matches one item at a time.
 * - Vicinae's native renderer reads List.Item.Detail markdown on first mount
 *   and does not update it on subsequent re-renders, so the first 5 results
 *   are pre-loaded before items appear. Remaining items show the short_def
 *   from search results as a meaningful fallback.
 *
 * Responsiveness:
 * - All process calls are asynchronous (non-blocking), so the loading state
 *   can render and the UI never freezes while lookups run.
 * - Input is debounced to avoid spawning processes on every keystroke.
 * - A monotonically increasing sequence number discards stale responses so a
 *   slower earlier search never overwrites newer results.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  List,
  Detail,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  Keyboard,
} from "@vicinae/api";

import {
  searchWordsAsync,
  lookupWordAsync,
  openInWordLex,
  cmdModifier,
} from "./lib/wordlex";
import {
  formatWordDetailMarkdown,
  formatWordDetailPlainText,
} from "./lib/formatter";
import { POS_LABELS } from "./lib/types";
import type { SearchResult, WordDetail } from "./lib/types";

const SEARCH_DEBOUNCE_MS = 200;
const PRELOAD_COUNT = 5;

// ─── Full-screen Detail view (pushed via Action.Push) ───────

function WordDetailView({ word }: { word: string }) {
  // undefined = loading, null = not found, WordDetail = found
  const [detail, setDetail] = useState<WordDetail | null | undefined>(
    undefined
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(undefined);
    setError(null);

    lookupWordAsync(word)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [word]);

  if (error) {
    return (
      <Detail navigationTitle={word} markdown={`# ${word}\n\n*${error}*`} />
    );
  }

  if (detail === undefined) {
    return (
      <Detail
        navigationTitle={word}
        markdown={`# ${word}\n\n*Loading definition…*`}
      />
    );
  }

  if (!detail) {
    return (
      <Detail
        navigationTitle={word}
        markdown={`# ${word}\n\n*Word not found in the dictionary.*`}
      />
    );
  }

  return (
    <Detail
      navigationTitle={word}
      markdown={formatWordDetailMarkdown(detail)}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Definition"
            content={formatWordDetailPlainText(detail)}
            icon={Icon.Clipboard}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
          <Action.Paste
            title="Paste Word"
            content={word}
            icon={Icon.Text}
            shortcut={{ key: "p", modifiers: [cmdModifier, "shift"] }}
          />
          <Action.OpenInBrowser
            title="Open in Wiktionary"
            url={`https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`}
            icon={Icon.Globe}
            shortcut={{ key: "w", modifiers: [cmdModifier] }}
          />
          <Action
            title="Open in WordLex"
            icon={Icon.AppWindow}
            shortcut={{ key: "o", modifiers: [cmdModifier] }}
            onAction={() => openInWordLex(word)}
          />
        </ActionPanel>
      }
    />
  );
}

// ─── Main List view ─────────────────────────────────────────

export default function SearchDictionary() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Cache: word (lowercase) → WordDetail. Lives in a ref for O(1) stable lookup.
  const detailCache = useRef<Map<string, WordDetail>>(new Map());
  // Bumping this counter forces a re-render so items pick up newly cached details.
  const [, setDetailVersion] = useState(0);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic sequence so only the latest search's response is applied.
  const searchSeq = useRef(0);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  /** Load a word's full detail into the cache (async). No-op if already cached. */
  const loadDetail = useCallback((word: string): Promise<void> => {
    const key = word.toLowerCase();
    if (detailCache.current.has(key)) return Promise.resolve();

    return lookupWordAsync(word)
      .then((detail) => {
        if (!detail) return;
        detailCache.current.set(key, detail);
        setDetailVersion((v) => v + 1);
      })
      .catch((err) => {
        showToast({
          style: Toast.Style.Failure,
          title: "Lookup Failed",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      });
  }, []);

  const handleSearchChange = useCallback(
    (text: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);

      const query = text.trim();
      if (!query) {
        searchSeq.current++;
        setResults([]);
        setIsLoading(false);
        setHasError(false);
        return;
      }

      setIsLoading(true);
      setHasError(false);

      searchTimer.current = setTimeout(() => {
        const seq = ++searchSeq.current;
        searchWordsAsync(query)
          .then((searchResults) => {
            if (seq !== searchSeq.current) return searchResults;

            // Pre-load details for the first few visible results BEFORE setting
            // state. Vicinae's native renderer reads List.Item.Detail markdown
            // on first mount and does not update it on subsequent re-renders,
            // so the data must be cached before items appear. The lookups run
            // in parallel and asynchronously so the UI stays responsive.
            const preloads = searchResults
              .slice(0, PRELOAD_COUNT)
              .map((result) => loadDetail(result.word));
            return Promise.allSettled(preloads).then(() => searchResults);
          })
          .then((searchResults) => {
            if (seq !== searchSeq.current) return;
            setResults(searchResults);
          })
          .catch((err) => {
            if (seq !== searchSeq.current) return;
            setHasError(true);
            showToast({
              style: Toast.Style.Failure,
              title: "WordLex Error",
              message: err instanceof Error ? err.message : "Unknown error",
            });
          })
          .finally(() => {
            if (seq === searchSeq.current) setIsLoading(false);
          });
      }, SEARCH_DEBOUNCE_MS);
    },
    [loadDetail]
  );

  const handleSelectionChange = useCallback(
    (id: string | null) => {
      if (!id) return;
      loadDetail(id);
    },
    [loadDetail]
  );

  return (
    <List
      isShowingDetail
      isLoading={isLoading}
      searchBarPlaceholder="Search 150,000+ words..."
      onSearchTextChange={handleSearchChange}
      onSelectionChange={handleSelectionChange}
    >
      {hasError && results.length === 0 ? (
        <List.EmptyView
          title="WordLex Not Found"
          description="Make sure WordLex is installed and the 'wordlex' command is available on your PATH."
          icon={Icon.ExclamationMark}
        />
      ) : results.length === 0 ? (
        <List.EmptyView
          title="Search the Dictionary"
          description="Start typing to search 150,000+ words"
          icon={Icon.Book}
        />
      ) : (
        <List.Section title="Results" subtitle={`${results.length} words`}>
          {results.map((result) => {
            const cached = detailCache.current.get(result.word.toLowerCase());
            return (
              <List.Item
                key={result.word}
                id={result.word}
                title={result.word}
                subtitle={result.pos_list
                  .map((p) => POS_LABELS[p] ?? p)
                  .join(", ")}
                accessories={[{ text: truncate(result.short_def, 50) }]}
                detail={
                  <List.Item.Detail
                    markdown={
                      cached
                        ? formatWordDetailMarkdown(cached)
                        : `# ${result.word}\n\n*${result.pos_list
                            .map((p) => POS_LABELS[p] ?? p)
                            .join(", ")}*\n\n${result.short_def}`
                    }
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="View Full Definition"
                      icon={Icon.Eye}
                      target={<WordDetailView word={result.word} />}
                    />
                    <Action.CopyToClipboard
                      title="Copy Definition"
                      content={
                        cached
                          ? formatWordDetailPlainText(cached)
                          : result.short_def
                      }
                      icon={Icon.Clipboard}
                      shortcut={Keyboard.Shortcut.Common.Copy}
                    />
                    <Action.Paste
                      title="Paste Word"
                      content={result.word}
                      icon={Icon.Text}
                      shortcut={{ key: "p", modifiers: [cmdModifier, "shift"] }}
                    />
                    <Action.OpenInBrowser
                      title="Open in Wiktionary"
                      url={`https://en.wiktionary.org/wiki/${encodeURIComponent(result.word)}`}
                      icon={Icon.Globe}
                      shortcut={{ key: "w", modifiers: [cmdModifier] }}
                    />
                    <Action
                      title="Open in WordLex"
                      icon={Icon.AppWindow}
                      shortcut={{ key: "o", modifiers: [cmdModifier] }}
                      onAction={() => openInWordLex(result.word)}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}

/** Truncate a string to a maximum length, appending "…" if truncated. */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}
