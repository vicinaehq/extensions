import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  LocalStorage,
  getPreferenceValues,
} from "@vicinae/api";
import {
  isLocalTarget,
  listConnections,
  type PodmanConnection,
} from "./podman";

const STORAGE_KEY = "podman-connection";

type Preferences = {
  defaultConnection?: string;
};

// Tracks the selected podman connection ("" = podman's default).
// The selection is shared between commands and persisted across sessions.
export function useConnection() {
  const [connections, setConnections] = useState<PodmanConnection[]>([]);
  const [connection, setConnectionState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await LocalStorage.getItem<string>(STORAGE_KEY);
      const initial =
        typeof stored === "string"
          ? stored
          : (getPreferenceValues<Preferences>().defaultConnection || "").trim();
      setConnections(await listConnections());
      setConnectionState(initial);
      setReady(true);
    })();
  }, []);

  const setConnection = useCallback((name: string) => {
    setConnectionState(name);
    LocalStorage.setItem(STORAGE_KEY, name);
  }, []);

  // sudo system containers are only meaningful when plain `podman` hits the local socket
  const allowSystem = connection === "" && isLocalTarget("", connections);

  return { connections, connection, setConnection, ready, allowSystem };
}

export function connectionLabel(connection: string): string {
  return connection || "Default Connection";
}

export function ConnectionSubmenu({
  connections,
  connection,
  onSelect,
}: {
  connections: PodmanConnection[];
  connection: string;
  onSelect: (name: string) => void;
}) {
  return (
    <ActionPanel.Submenu
      title="Switch Connection"
      icon={Icon.Network}
    >
      <Action
        title="Default Connection"
        icon={connection === "" ? Icon.Checkmark : Icon.Circle}
        onAction={() => onSelect("")}
      />
      {connections.map((c) => (
        <Action
          key={c.name}
          title={`${c.name}${c.isDefault ? " (default)" : ""}`}
          icon={connection === c.name ? Icon.Checkmark : Icon.Circle}
          onAction={() => onSelect(c.name)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}
