/**
 * Random Word — View command for the WordLex Vicinae extension.
 *
 * Fetches a random word from the WordLex database and displays its full
 * definition in a Detail view. Great for vocabulary building.
 *
 * The lookup runs asynchronously so the Detail view can show a loading
 * state and a meaningful error message (with toast) when WordLex is missing.
 */

import { useEffect, useState } from "react";
import {
  Detail,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  Keyboard,
} from "@vicinae/api";

import { randomWordAsync, openInWordLex, cmdModifier } from "./lib/wordlex";
import {
  formatWordDetailMarkdown,
  formatWordDetailPlainText,
} from "./lib/formatter";
import type { WordDetail } from "./lib/types";

export default function RandomWord() {
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    randomWordAsync()
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        setIsLoading(false);
        showToast({
          style: Toast.Style.Failure,
          title: "WordLex Error",
          message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <Detail
        navigationTitle="Random Word"
        markdown="# 🎲 Fetching a random word…"
      />
    );
  }

  if (error) {
    return (
      <Detail
        navigationTitle="Random Word"
        markdown={`# 🎲 Could not fetch a random word\n\n*${error}*`}
      />
    );
  }

  if (!detail) {
    return (
      <Detail
        navigationTitle="Random Word"
        markdown="# 🎲 No word found\n\nCould not fetch a random word. Is WordLex installed?"
      />
    );
  }

  return (
    <Detail
      navigationTitle={`Random: ${detail.word}`}
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
            content={detail.word}
            icon={Icon.Text}
            shortcut={{ key: "p", modifiers: [cmdModifier, "shift"] }}
          />
          <Action.OpenInBrowser
            title="Open in Wiktionary"
            url={`https://en.wiktionary.org/wiki/${encodeURIComponent(detail.word)}`}
            icon={Icon.Globe}
            shortcut={{ key: "w", modifiers: [cmdModifier] }}
          />
          <Action
            title="Open in WordLex"
            icon={Icon.AppWindow}
            shortcut={{ key: "o", modifiers: [cmdModifier] }}
            onAction={() => openInWordLex(detail.word)}
          />
        </ActionPanel>
      }
    />
  );
}
