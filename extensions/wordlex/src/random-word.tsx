/**
 * Random Word — View command for the WordLex Vicinae extension.
 *
 * Fetches a random word from the WordLex database and displays its full
 * definition in a Detail view. Great for vocabulary building.
 */

import {
  Detail,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
} from "@vicinae/api";
import { spawn } from "node:child_process";

import { randomWord } from "./lib/wordlex";
import {
  formatWordDetailMarkdown,
  formatWordDetailPlainText,
} from "./lib/formatter";

export default function RandomWord() {
  const detail = randomWord();

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
          />
          <Action.Paste
            title="Paste Word"
            content={detail.word}
            icon={Icon.Text}
            shortcut={{ key: "p", modifiers: ["cmd", "shift"] }}
          />
          <Action.OpenInBrowser
            title="Open in Wiktionary"
            url={`https://en.wiktionary.org/wiki/${encodeURIComponent(detail.word)}`}
            icon={Icon.Globe}
            shortcut={{ key: "w", modifiers: ["cmd"] }}
          />
          <Action
            title="Open in WordLex"
            icon={Icon.AppWindow}
            shortcut={{ key: "o", modifiers: ["cmd"] }}
            onAction={() => {
              try {
                const child = spawn("wordlex", ["--search", detail.word], {
                  detached: true,
                  stdio: "ignore",
                });
                child.unref();
              } catch {
                showToast({
                  style: Toast.Style.Failure,
                  title: "Could not open WordLex",
                });
              }
            }}
          />
        </ActionPanel>
      }
    />
  );
}
