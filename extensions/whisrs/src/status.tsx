import { useEffect, useState } from "react";
import {
  Detail,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  getPreferenceValues,
} from "@vicinae/api";
import { whisrsStatus, WhisrsError, type WhisrsPrefs } from "./whisrs";

export default function StatusCommand() {
  const prefs = getPreferenceValues<WhisrsPrefs>();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const out = await whisrsStatus(prefs);
        setStatus(out);
      } catch (e) {
        const msg = e instanceof WhisrsError ? e.message : String(e);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [prefs]);

  const recording = /recording/i.test(status);

  const markdown = error
    ? `## Whisrs\n\n# ⚠️ Not available\n\n${error}\n`
    : `# Whisrs\n\n\`\`\`\n${status || "(no status output)"}\n\`\`\`\n`;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Recording">
            <Action
              title={recording ? "Stop Recording" : "Start Recording"}
              icon={recording ? Icon.Stop : Icon.Microphone}
              onAction={async () => {
                await showToast({
                  style: Toast.Style.Animated,
                  title: recording ? "Stopping…" : "Starting…",
                });
                try {
                  const { whisrsToggle } = await import("./whisrs");
                  await whisrsToggle(prefs);
                  await showToast({
                    style: Toast.Style.Success,
                    title: recording ? "Stopped" : "Recording started",
                  });
                } catch (e) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Failed to toggle",
                    message: e instanceof WhisrsError ? e.message : String(e),
                  });
                }
              }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Daemon">
            <Action
              title="Restart Daemon"
              icon={Icon.ArrowClockwise}
              onAction={async () => {
                try {
                  const { whisrsRestart } = await import("./whisrs");
                  await whisrsRestart(prefs);
                  await showToast({
                    style: Toast.Style.Success,
                    title: "Daemon restarted",
                  });
                } catch (e) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Restart failed",
                    message: e instanceof WhisrsError ? e.message : String(e),
                  });
                }
              }}
            />
            <Action
              title="Run Setup"
              icon={Icon.Cog}
              onAction={async () => {
                const { whisrsSetupCommand, resolveBinary } = await import("./whisrs");
                await import("@vicinae/api").then((m) =>
                  (m as any).runInTerminal?.(whisrsSetupCommand(prefs), { hold: true }),
                );
                void resolveBinary;
              }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy Status"
              content={status || error || ""}
            />
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              onAction={() => {
                setIsLoading(true);
                whisrsStatus(prefs)
                  .then(setStatus)
                  .catch((e) => setError(e instanceof WhisrsError ? e.message : String(e)))
                  .finally(() => setIsLoading(false));
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
