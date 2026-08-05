import { useEffect, useRef, useState } from "react";
import { tailConversationMarkdown } from "../lib/markdown";

/**
 * Prefix-based auto-scroll for the detail panel.
 *
 * Vicinae's MarkdownModel (C++) decides how to handle new markdown content
 * based on whether the new string is a prefix-extension of the old one:
 *
 * - If `newMarkdown.startsWith(oldMarkdown)` → incremental append path.
 *   Emits `blocksAppended`, which triggers auto-scroll when the Flickable
 *   was already at the bottom (`atYEnd = true`).
 *
 * - Otherwise → full model reset. Scrolls to top, no auto-scroll.
 *
 * This hook uses two strategies:
 *
 * **On content change** (load conversation, send message):
 * Two-step render — first character → full content after 50ms.
 * The prefix match triggers `blocksAppended` → auto-scroll.
 *
 * **Static display** (initial render, arrow key navigation):
 * Shows only the tail of the conversation (last exchange). Since the
 * detail panel always renders from the top, showing only the end means
 * the most recent content is immediately visible without scrolling.
 * Changing `markdown` during navigation resets list selection (Vicinae
 * platform limitation), so we show the tail from the initial render.
 *
 * During active AI streaming, passes through the raw markdown directly —
 * AI chunks are naturally prefix-extending, so MarkdownModel already
 * takes the append path without any tricks.
 */
const SCROLL_DELAY_MS = 50;

export function useAutoScrollMarkdown(
  markdown: string,
  isStreaming = false,
): string {
  // Initialize with the tail — shows the last exchange at the top
  // of the detail panel during navigation (no scroll needed).
  const [displayed, setDisplayed] = useState(() =>
    tailConversationMarkdown(markdown),
  );
  const targetRef = useRef(markdown);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    if (markdown === targetRef.current) return;
    targetRef.current = markdown;

    // During active AI streaming, pass through directly
    if (isStreaming) {
      stopTimer();
      setDisplayed(markdown);
      return;
    }

    // Two-step: first character → full content after delay.
    // This triggers MarkdownModel's append path → auto-scroll.
    stopTimer();
    setDisplayed(markdown.charAt(0) || "");

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDisplayed(targetRef.current);
    }, SCROLL_DELAY_MS);

    return () => stopTimer();
  }, [markdown, isStreaming]);

  return displayed;
}
