import { useEffect, useRef, useState } from "react";
import { Action, ActionPanel, Color, Detail, Icon, List, Toast, showToast } from "@vicinae/api";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import {
  DejaConfig,
  IndexEntry,
  IndexMeta,
  Snapshot,
  buildFileIndex,
  dumpFile,
  listSnapshots,
  loadIndex,
  pruneOrphanIndexes,
  readConfig,
  readIndexMeta,
  restorePath,
  searchIndex,
} from "./lib/deja-dup";
import { formatBytes } from "./lib/format";
import { ErrorView, launchDejaDup } from "./browse-backup";
import { open, environment } from "@vicinae/api";

type Phase = "loading" | "needs-index" | "building" | "ready" | "error";

export default function SearchFiles() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<IndexMeta | null>(null);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [config, setConfig] = useState<DejaConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IndexEntry[]>([]);
  const indexRef = useRef<string[]>([]);

  async function init() {
    setPhase("loading");
    try {
      const [cfg, snaps] = await Promise.all([readConfig(), listSnapshots()]);
      setConfig(cfg);
      const newest = snaps[0] ?? null;
      setLatest(newest);
      pruneOrphanIndexes(snaps.map((s) => s.short_id));
      const m = newest ? await readIndexMeta(newest.short_id) : null;
      setMeta(m);
      if (m && newest) {
        indexRef.current = await loadIndex(newest.short_id);
        setPhase("ready");
      } else {
        setPhase("needs-index");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  useEffect(() => {
    init();
  }, []);

  async function build() {
    if (!latest) return;
    setPhase("building");
    setProgress(0);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Building search index…" });
    try {
      const info = await buildFileIndex(latest, (c) => {
        setProgress(c);
        toast.message = `${c.toLocaleString()} files`;
      }, config ?? undefined);
      indexRef.current = await loadIndex(latest.short_id);
      setMeta(info);
      toast.style = Toast.Style.Success;
      toast.title = "Index ready";
      toast.message = `${info.count.toLocaleString()} files`;
      setPhase("ready");
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Index build failed";
      toast.message = e instanceof Error ? e.message : String(e);
      setPhase("needs-index");
    }
  }

  // Debounced local filtering — instant once the index is loaded.
  useEffect(() => {
    if (phase !== "ready") return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setResults(searchIndex(indexRef.current, query.trim()));
    }, 150);
    return () => clearTimeout(handle);
  }, [query, phase]);

  if (phase === "error") return <ErrorView message={error ?? "Unknown error"} />;

  if (phase === "needs-index" || phase === "building" || phase === "loading") {
    return (
      <BuildScreen
        phase={phase}
        latest={latest}
        meta={meta}
        progress={progress}
        onBuild={build}
      />
    );
  }

  const stale = meta && latest && meta.snapshotId !== latest.id;
  return (
    <List
      onSearchTextChange={setQuery}
      searchBarPlaceholder={`Search ${meta?.count.toLocaleString() ?? ""} files…`}
      throttle
    >
      <List.EmptyView
        title={query.trim().length < 2 ? "Type to search" : "No matches"}
        description={
          query.trim().length < 2
            ? `Instant local search across your latest backup (${meta?.shortId ?? ""}).`
            : `Nothing matching "${query}".`
        }
        icon={Icon.MagnifyingGlass}
      />
      {results.map((r) => (
        <List.Item
          key={r.path}
          title={r.name}
          subtitle={r.path}
          icon={
            r.type === "dir"
              ? { source: Icon.Folder, tintColor: Color.Blue }
              : { source: Icon.BlankDocument, tintColor: Color.SecondaryText }
          }
          accessories={r.type === "dir" ? [{ text: "folder" }] : [{ tag: formatBytes(r.size) }]}
          actions={
            <ActionPanel>
              {r.type !== "dir" && config && meta && (
                <Action
                  title="Preview File"
                  icon={Icon.Eye}
                  onAction={() => previewFile(config, meta.snapshotId, r)}
                />
              )}
              {config && meta && (
                <Action
                  title="Restore to Original Location"
                  icon={Icon.ArrowClockwise}
                  onAction={() => runRestore(config, meta.snapshotId, r.path, "/")}
                />
              )}
              <Action.CopyToClipboard title="Copy Path" content={r.path} />
              {stale && (
                <Action title="Rebuild Index (newer backup available)" icon={Icon.ArrowClockwise} onAction={build} />
              )}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function BuildScreen({
  phase,
  latest,
  meta,
  progress,
  onBuild,
}: {
  phase: Phase;
  latest: Snapshot | null;
  meta: IndexMeta | null;
  progress: number;
  onBuild: () => void;
}) {
  const md =
    phase === "building"
      ? [
          "# Building search index…",
          "",
          `Indexed **${progress.toLocaleString()}** files so far.`,
          "",
          "This reads your latest backup once so that searching afterwards is instant and offline.",
          "It can take up to a minute on a cloud backup — you only do this once per backup.",
        ].join("\n")
      : phase === "loading"
        ? "# Loading…"
        : [
            "# Fast file search",
            "",
            "Searching a cloud backup file-by-file is painfully slow, so this builds a small local",
            "index of your latest backup **once**. After that, search is instant and works offline.",
            "",
            latest ? `Latest snapshot: **${latest.short_id}** (${latest.paths.join(", ")})` : "",
            meta ? `\nA previous index exists for **${meta.shortId}** — rebuild it for the latest backup.` : "",
          ]
            .filter(Boolean)
            .join("\n");

  return (
    <Detail
      markdown={md}
      actions={
        phase === "building" ? undefined : (
          <ActionPanel>
            <Action title="Build Search Index" icon={Icon.MagnifyingGlass} onAction={onBuild} />
            <Action title="Open Déjà Dup" icon={Icon.Cog} onAction={launchDejaDup} />
          </ActionPanel>
        )
      }
    />
  );
}

async function previewFile(config: DejaConfig, snapshotId: string, entry: IndexEntry) {
  const toast = await showToast({ style: Toast.Style.Animated, title: `Fetching ${entry.name}…` });
  try {
    const dest = join(environment.supportPath || tmpdir(), `preview-${basename(entry.path)}`);
    await dumpFile(snapshotId, entry.path, dest, config);
    toast.style = Toast.Style.Success;
    toast.title = "Opening preview";
    await open(dest);
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Preview failed";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}

async function runRestore(config: DejaConfig, snapshotId: string, path: string, targetDir: string) {
  const toast = await showToast({ style: Toast.Style.Animated, title: `Restoring ${basename(path)}…` });
  try {
    await restorePath(snapshotId, path, targetDir, config);
    toast.style = Toast.Style.Success;
    toast.title = "Restored";
    toast.message = `${basename(path)} → ${targetDir}`;
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Restore failed";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}
