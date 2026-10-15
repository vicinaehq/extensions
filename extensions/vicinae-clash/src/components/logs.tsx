import { Action, ActionPanel, Color, Detail, Icon, List } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { formatTime } from "../lib/format";
import { useWebSocketJson } from "../lib/use-websocket";
import type { LogEntry, LogLevel } from "../types";

type LogMessage = Omit<LogEntry, "time">;

const LEVELS: LogLevel[] = ["error", "warning", "info", "debug"];
const COLORS: Record<LogLevel, Color> = {
  debug: Color.Green,
  info: Color.Blue,
  warning: Color.Yellow,
  error: Color.Red,
};

export default function Logs() {
  const [level, setLevel] = useState<LogLevel>("info");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchText, setSearchText] = useState("");
  const stream = useWebSocketJson<LogMessage>("/logs", { level });

  useEffect(() => {
    const next = stream.data;
    if (!next) return;
    setLogs((current) => [{ ...next, time: formatTime() }, ...current].slice(0, 500));
  }, [stream.data]);

  const filtered = useMemo(() => {
    const query = searchText.toLocaleLowerCase();
    return query ? logs.filter((log) => log.payload.toLocaleLowerCase().includes(query)) : logs;
  }, [logs, searchText]);

  return (
    <List
      filtering={false}
      isLoading={stream.isConnecting && logs.length === 0}
      searchBarPlaceholder={`Search ${level} logs...`}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Log Level"
          value={level}
          storeValue={false}
          onChange={(value) => {
            setLogs([]);
            setLevel(value as LogLevel);
          }}
        >
          {LEVELS.map((item) => (
            <List.Dropdown.Item key={item} title={item[0].toUpperCase() + item.slice(1)} value={item} />
          ))}
        </List.Dropdown>
      }
    >
      {stream.error ? (
        <List.Item
          icon={{ source: Icon.Exclamationmark, tintColor: Color.Red }}
          title="Log Stream Error"
          subtitle={stream.error}
        />
      ) : null}
      {filtered.map((log, index) => (
        <List.Item
          key={`${log.time}-${index}`}
          icon={{ source: Icon.CircleFilled, tintColor: COLORS[log.type] }}
          title={log.time}
          subtitle={log.payload}
          accessories={[{ tag: { value: log.type, color: COLORS[log.type] } }]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Show Details"
                icon={Icon.Eye}
                target={<Detail markdown={`\`\`\`text\n${log.payload}\n\`\`\``} />}
              />
              <Action.CopyToClipboard title="Copy Log" content={log.payload} />
              <Action title="Clear Logs" icon={Icon.Trash} onAction={() => setLogs([])} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
