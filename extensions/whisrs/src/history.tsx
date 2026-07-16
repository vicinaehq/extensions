import { useEffect, useState } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  Clipboard,
  getPreferenceValues,
} from "@vicinae/api";
import { whisrsLog, WhisrsError, type WhisrsPrefs } from "./whisrs";

export default function HistoryCommand() {
  const prefs = getPreferenceValues<WhisrsPrefs>();
  const limit = Number.parseInt(prefs.historyLimit ?? "10", 10) || 10;
  const [isLoading, setIsLoading] = useState(true);
  const [entries, setEntries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const out = await whisrsLog(prefs, limit);
        setEntries(out);
      } catch (e) {
        setError(e instanceof WhisrsError ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [prefs, limit]);

  if (error) {
    return (
      <List isLoading={false}>
        <List.EmptyView
          title="Could not load history"
          description={error}
          icon={Icon.Exclamationmark}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search transcriptions…"
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={() => {
              setIsLoading(true);
              whisrsLog(prefs, limit)
                .then(setEntries)
                .catch((e) => setError(e instanceof WhisrsError ? e.message : String(e)))
                .finally(() => setIsLoading(false));
            }}
          />
          <Action
            title="Clear History"
            icon={Icon.Trash}
            style="destructive"
            onAction={async () => {
              try {
                const { resolveBinary } = await import("./whisrs");
                const { execFile } = await import("node:child_process");
                const { promisify } = await import("node:util");
                await promisify(execFile)(
                  resolveBinary(prefs),
                  ["log", "--clear"],
                  { maxBuffer: 1024 * 1024 },
                );
                setEntries([]);
                await showToast({
                  style: Toast.Style.Success,
                  title: "History cleared",
                });
              } catch (e) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Failed to clear",
                  message: e instanceof WhisrsError ? e.message : String(e),
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      {entries.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No transcriptions yet"
          description="Start dictating with whisrs to build up history."
          icon={Icon.Microphone}
        />
      ) : (
        entries.map((entry, idx) => (
          <List.Item
            key={`${idx}-${entry.slice(0, 32)}`}
            title={entry}
            icon={Icon.Microphone}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action
                    title="Paste Transcription"
                    icon={Icon.Waveform}
                    onAction={async () => {
                      await Clipboard.paste(entry);
                      await showToast({
                        style: Toast.Style.Success,
                        title: "Pasted",
                      });
                    }}
                  />
                  <Action.CopyToClipboard title="Copy Transcription" content={entry} />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Delete From History"
                    icon={Icon.Trash}
                    style="destructive"
                    onAction={() => {
                      setEntries((prev) => prev.filter((_, i) => i !== idx));
                    }}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
