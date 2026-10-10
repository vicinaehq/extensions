import { useEffect, useRef, useState } from "react";
import { Action, ActionPanel, Color, Icon, List, open } from "@vicinae/api";
import {
  SearchHit,
  Snapshot,
  SnapperConfig,
  hasAccess,
  listConfigs,
  listSnapshots,
  searchInSnapshot,
  snapshotMountPath,
} from "./lib/snapper";
import { relativeTime } from "./lib/format";
import { AccessGate, ErrorView } from "./browse-snapshots";

interface Target {
  key: string;
  label: string;
  mountPath: string;
}

function humanSize(n: number): string {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function SearchFiles() {
  const [access, setAccess] = useState<boolean | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  async function load() {
    try {
      const ok = await hasAccess();
      setAccess(ok);
      if (!ok) return;
      const configs: SnapperConfig[] = await listConfigs();
      const built: Target[] = [];
      for (const c of configs) {
        const snaps: Snapshot[] = await listSnapshots(c.config);
        for (const s of snaps) {
          if (s.number === 0) continue;
          built.push({
            key: `${c.config}|${s.number}`,
            label: `${c.config} #${s.number} · ${relativeTime(s.date)}`,
            mountPath: snapshotMountPath(c, s.number),
          });
        }
      }
      setTargets(built);
      if (built.length) setSelected(built[0].key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  const target = targets.find((t) => t.key === selected);

  useEffect(() => {
    if (!target || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = ++runId.current;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await searchInSnapshot(target.mountPath, query.trim());
        if (id === runId.current) setHits(res);
      } catch {
        if (id === runId.current) setHits([]);
      } finally {
        if (id === runId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query, selected]);

  if (error) return <ErrorView message={error} />;
  if (access === false) return <AccessGate onDone={load} />;

  return (
    <List
      isLoading={loading}
      onSearchTextChange={setQuery}
      throttle
      searchBarPlaceholder="Search files in the selected snapshot…"
      searchBarAccessory={
        <List.Dropdown tooltip="Snapshot" value={selected} onChange={setSelected}>
          {targets.map((t) => (
            <List.Dropdown.Item key={t.key} title={t.label} value={t.key} icon={Icon.Camera} />
          ))}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        title={query.trim().length < 2 ? "Type to search" : loading ? "Searching…" : "No matches"}
        description={
          query.trim().length < 2
            ? "Instant local search inside a read-only snapshot."
            : `Nothing matching "${query}".`
        }
        icon={Icon.MagnifyingGlass}
      />
      {hits.map((h) => (
        <List.Item
          key={h.fullPath}
          title={h.name}
          subtitle={h.path}
          icon={
            h.type === "d"
              ? { source: Icon.Folder, tintColor: Color.Blue }
              : { source: Icon.BlankDocument, tintColor: Color.SecondaryText }
          }
          accessories={h.type === "d" ? [{ text: "folder" }] : [{ tag: humanSize(h.size) }]}
          actions={
            <ActionPanel>
              <Action title="Open" icon={Icon.Eye} onAction={() => open(h.fullPath)} />
              <Action.CopyToClipboard title="Copy Snapshot Path" content={h.fullPath} />
              <Action.CopyToClipboard title="Copy Original Path" content={h.path} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
