import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, List, showToast, Toast } from "@vicinae/api";
import { useMemo, useState } from "react";
import { closeAllConnections, closeConnection } from "../lib/clash-api";
import { prettyBytes } from "../lib/format";
import { showError } from "../lib/toast";
import { useWebSocketJson } from "../lib/use-websocket";
import type { Connection, Connections as ConnectionsData } from "../types";

function connectionHost(connection: Connection): string {
  const host = connection.metadata.host || connection.metadata.destinationIP || "Unknown host";
  return connection.metadata.destinationPort ? `${host}:${connection.metadata.destinationPort}` : host;
}

function connectionText(connection: Connection): string {
  return [
    `Host: ${connectionHost(connection)}`,
    `Source: ${connection.metadata.sourceIP ?? ""}:${connection.metadata.sourcePort ?? ""}`,
    `Network: ${connection.metadata.type ?? ""} / ${connection.metadata.network ?? ""}`,
    `Chains: ${connection.chains.join(" / ")}`,
    `Rule: ${connection.rule}${connection.rulePayload ? ` (${connection.rulePayload})` : ""}`,
    `Download: ${prettyBytes(connection.download)}`,
    `Upload: ${prettyBytes(connection.upload)}`,
    `Started: ${connection.start}`,
  ].join("\n");
}

export default function Connections() {
  const { data, isConnecting, error } = useWebSocketJson<ConnectionsData>("/connections");
  const [searchText, setSearchText] = useState("");
  const [showRouting, setShowRouting] = useState(false);
  const connections = data?.connections ?? [];

  const filtered = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query) return connections;
    return connections.filter((connection) =>
      [
        connection.metadata.host,
        connection.metadata.destinationIP,
        connection.metadata.destinationPort,
        connection.metadata.sourceIP,
        connection.rule,
        connection.rulePayload,
        ...connection.chains,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(query)),
    );
  }, [connections, searchText]);

  async function closeOne(connection: Connection) {
    const host = connectionHost(connection);
    if (
      !(await confirmAlert({
        title: "Close this connection?",
        message: host,
        primaryAction: { title: "Close Connection", style: Alert.ActionStyle.Destructive },
      }))
    )
      return;

    try {
      await closeConnection(connection.id);
      await showToast({ style: Toast.Style.Success, title: "Connection Closed", message: host });
    } catch (closeError) {
      await showError("Could Not Close Connection", closeError);
    }
  }

  async function closeAll() {
    if (
      !(await confirmAlert({
        title: "Close all active connections?",
        message: `This will close ${connections.length} active connection${connections.length === 1 ? "" : "s"}.`,
        primaryAction: { title: "Close All", style: Alert.ActionStyle.Destructive },
      }))
    )
      return;

    try {
      await closeAllConnections();
      await showToast({ style: Toast.Style.Success, title: "All Connections Closed" });
    } catch (closeError) {
      await showError("Could Not Close All Connections", closeError);
    }
  }

  return (
    <List
      filtering={false}
      isLoading={isConnecting && !data}
      searchBarPlaceholder="Search active connections..."
      onSearchTextChange={setSearchText}
    >
      {error ? (
        <List.Item
          icon={{ source: Icon.Exclamationmark, tintColor: Color.Red }}
          title="Connection Stream Error"
          subtitle={error}
        />
      ) : null}
      {filtered.map((connection) => (
        <List.Item
          key={connection.id}
          icon={Icon.Globe01}
          title={connectionHost(connection)}
          subtitle={
            showRouting
              ? `${connection.rule}${connection.rulePayload ? ` (${connection.rulePayload})` : ""}`
              : connection.chains.join(" / ")
          }
          accessories={[
            showRouting
              ? { text: `${connection.metadata.type ?? ""}/${connection.metadata.network ?? ""}` }
              : { text: `${prettyBytes(connection.download)} ↓  ${prettyBytes(connection.upload)} ↑` },
          ]}
          actions={
            <ActionPanel>
              <Action
                title={showRouting ? "Show Traffic" : "Show Routing"}
                icon={Icon.Switch}
                onAction={() => setShowRouting((value) => !value)}
              />
              <Action.CopyToClipboard title="Copy Connection Details" content={connectionText(connection)} />
              <Action
                title="Close Connection"
                icon={Icon.XMarkCircle}
                style={Action.Style.Destructive}
                onAction={() => void closeOne(connection)}
              />
              <Action
                title="Close All Connections"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => void closeAll()}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
