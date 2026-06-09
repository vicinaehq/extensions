/**
 * Define Clipboard Word — View command for the WordLex Vicinae extension.
 *
 * Reads the system clipboard (or selected text), extracts the first word,
 * looks it up in the WordLex database, and displays the full definition
 * in a Detail view. Also provides actions to copy the definition.
 *
 * Priority: selected text > clipboard text.
 */

import { useState, useEffect } from "react";
import {
  Clipboard,
  Detail,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  getSelectedText,
  Keyboard,
} from "@vicinae/api";

import { lookupWord, openInWordLex, cmdModifier } from "./lib/wordlex";
import {
  formatWordDetailMarkdown,
  formatWordDetailPlainText,
} from "./lib/formatter";
import type { WordDetail } from "./lib/types";

export default function DefineClipboard() {
  const [markdown, setMarkdown] = useState("*Looking up clipboard word...*");
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [word, setWord] = useState<string | null>(null);

  useEffect(() => {
    async function define() {
      try {
        // Try selected text first, fall back to clipboard
        let rawText: string | undefined;
        try {
          rawText = await getSelectedText();
        } catch {
          // getSelectedText may throw if no selection or not supported
        }

        if (!rawText || !rawText.trim()) {
          rawText = await Clipboard.readText();
        }

        if (!rawText || !rawText.trim()) {
          setMarkdown(
            "# 📋 Clipboard is empty\n\nCopy a word to your clipboard first."
          );
          return;
        }

        // Extract the first word, stripping surrounding punctuation
        const firstWord = rawText
          .trim()
          .split(/\s+/)[0]
          .replace(/^[^\w]+|[^\w]+$/g, "");

        if (!firstWord) {
          setMarkdown(
            "# 📋 No word found\n\nThe clipboard does not contain a recognizable word."
          );
          return;
        }

        setWord(firstWord);

        const result = lookupWord(firstWord);

        if (!result) {
          setMarkdown(
            `# ❌ "${firstWord}" not found\n\nThis word is not in the WordLex dictionary.`
          );
          return;
        }

        setDetail(result);
        setMarkdown(formatWordDetailMarkdown(result));
      } catch (err) {
        setMarkdown(
          `# Error\n\n${err instanceof Error ? err.message : "Unknown error"}`
        );
        await showToast({
          style: Toast.Style.Failure,
          title: "WordLex Error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    define();
  }, []);

  return (
    <Detail
      navigationTitle={word ? `Define: ${word}` : "Define Clipboard Word"}
      markdown={markdown}
      actions={
        detail && word ? (
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
        ) : undefined
      }
    />
  );
}
