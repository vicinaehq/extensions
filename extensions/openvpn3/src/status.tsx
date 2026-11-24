import { Action, ActionPanel, Detail } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { isConnected, listSessions } from "./openvpn";
import { getProfile } from "./settings";

export default function Status() {
  const [loading, setLoading] = useState(true);
  const [markdown, setMarkdown] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [profile, { output, sessions }] = await Promise.all([getProfile(), listSessions()]);
      const matching = sessions.filter((session) => session.profile === profile);
      const state = !profile
        ? "Not configured"
        : matching.some(isConnected)
          ? "Connected"
          : matching.length
            ? "Session active — see details below"
            : "Disconnected";

      setMarkdown(`# ${state}\n\n## All OpenVPN 3 sessions\n\n    ${output.replace(/\n/g, "\n    ")}`);
    } catch (error) {
      setMarkdown(`# Status unavailable\n\n${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Detail
      isLoading={loading}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title="Refresh Status" onAction={refresh} />
        </ActionPanel>
      }
    />
  );
}
