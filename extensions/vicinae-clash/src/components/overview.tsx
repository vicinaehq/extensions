import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { getConfig, getVersion } from "../lib/clash-api";
import { errorMessage, prettyBytes } from "../lib/format";
import { useWebSocketJson } from "../lib/use-websocket";
import type { Config, Connections, Traffic, Version } from "../types";

const EMPTY_TRAFFIC: Traffic = { up: 0, down: 0 };
const EMPTY_CONNECTIONS: Connections = { uploadTotal: 0, downloadTotal: 0, connections: [] };

const PORTS: Array<{ key: keyof Config; title: string }> = [
  { key: "port", title: "HTTP Port" },
  { key: "socks-port", title: "SOCKS Port" },
  { key: "mixed-port", title: "Mixed Port" },
  { key: "redir-port", title: "Redirect Port" },
  { key: "tproxy-port", title: "TProxy Port" },
];

function booleanTag(value: boolean | undefined) {
  if (value === undefined) return { value: "Unknown", color: Color.SecondaryText };
  return value ? { value: "Enabled", color: Color.Green } : { value: "Disabled", color: Color.SecondaryText };
}

export default function Overview() {
  const traffic = useWebSocketJson<Traffic>("/traffic");
  const connections = useWebSocketJson<Connections>("/connections");
  const [config, setConfig] = useState<Config>();
  const [version, setVersion] = useState<Version>();
  const [systemError, setSystemError] = useState<string>();
  const [isSystemLoading, setIsSystemLoading] = useState(true);
  const trafficData = traffic.data ?? EMPTY_TRAFFIC;
  const connectionData = connections.data ?? EMPTY_CONNECTIONS;
  const error = traffic.error ?? connections.error;

  const loadSystem = useCallback(async () => {
    setIsSystemLoading(true);
    setSystemError(undefined);
    try {
      const [nextConfig, nextVersion] = await Promise.all([getConfig(), getVersion()]);
      setConfig(nextConfig);
      setVersion(nextVersion);
    } catch (loadError) {
      setSystemError(errorMessage(loadError));
    } finally {
      setIsSystemLoading(false);
    }
  }, []);

  useEffect(() => void loadSystem(), [loadSystem]);

  const configuredPorts = PORTS.flatMap(({ key, title }) => {
    const value = config?.[key];
    return typeof value === "number" && value > 0 ? [{ title, value }] : [];
  });

  return (
    <List
      isLoading={
        isSystemLoading || ((traffic.isConnecting || connections.isConnecting) && !traffic.data && !connections.data)
      }
    >
      {error ? (
        <List.Item
          icon={{ source: Icon.Exclamationmark, tintColor: Color.Red }}
          title="Live Data Unavailable"
          subtitle={error}
        />
      ) : null}
      {systemError ? (
        <List.Item
          icon={{ source: Icon.Exclamationmark, tintColor: Color.Red }}
          title="System Information Unavailable"
          subtitle={systemError}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={() => void loadSystem()} />
            </ActionPanel>
          }
        />
      ) : null}
      <List.Section title="Current Traffic">
        <List.Item
          icon={{ source: Icon.ArrowUp, tintColor: Color.Orange }}
          title="Upload"
          accessories={[{ text: `${prettyBytes(trafficData.up)}/s` }]}
        />
        <List.Item
          icon={{ source: Icon.ArrowDown, tintColor: Color.Blue }}
          title="Download"
          accessories={[{ text: `${prettyBytes(trafficData.down)}/s` }]}
        />
      </List.Section>
      <List.Section title="Session">
        <List.Item
          icon={Icon.Upload}
          title="Uploaded"
          accessories={[{ text: prettyBytes(connectionData.uploadTotal) }]}
        />
        <List.Item
          icon={Icon.Download}
          title="Downloaded"
          accessories={[{ text: prettyBytes(connectionData.downloadTotal) }]}
        />
        <List.Item
          icon={Icon.FullSignal}
          title="Active Connections"
          accessories={[{ text: String(connectionData.connections.length) }]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Connection Count"
                content={String(connectionData.connections.length)}
              />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Runtime">
        <List.Item
          icon={Icon.ComputerChip}
          title="Version"
          subtitle={version?.meta ? "mihomo Meta" : "Clash"}
          accessories={[{ text: version?.version ?? "Unknown" }]}
          actions={
            <ActionPanel>
              <Action
                title="Refresh Runtime Information"
                icon={Icon.ArrowClockwise}
                onAction={() => void loadSystem()}
              />
              {version?.version ? <Action.CopyToClipboard title="Copy Version" content={version.version} /> : null}
            </ActionPanel>
          }
        />
        <List.Item icon={Icon.Gauge} title="Memory" accessories={[{ text: prettyBytes(connectionData.memory ?? 0) }]} />
        <List.Item icon={Icon.Switch} title="TUN" accessories={[{ tag: booleanTag(config?.tun?.enable) }]} />
        <List.Item icon={Icon.Network} title="IPv6" accessories={[{ tag: booleanTag(config?.ipv6) }]} />
        <List.Item icon={Icon.Globe01} title="Allow LAN" accessories={[{ tag: booleanTag(config?.["allow-lan"]) }]} />
      </List.Section>
      {configuredPorts.length > 0 ? (
        <List.Section title="Listening Ports">
          {configuredPorts.map(({ title, value }) => (
            <List.Item
              key={title}
              icon={Icon.Link}
              title={title}
              accessories={[{ text: String(value) }]}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard title={`Copy ${title}`} content={String(value)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
