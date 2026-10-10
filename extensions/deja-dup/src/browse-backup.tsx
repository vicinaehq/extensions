import { useEffect, useRef, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
  open,
  environment,
} from "@vicinae/api";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import {
  DejaConfig,
  IndexEntry,
  Snapshot,
  buildFileIndex,
  dumpFile,
  hasIndex,
  listDir,
  listDirFromLines,
  listSnapshots,
  loadIndex,
  pruneOrphanIndexes,
  readConfig,
  restorePath,
} from "./lib/deja-dup";
import { useCached } from "./lib/cache";
import {
  duration,
  formatBytes,
  fullDate,
  recencyBucket,
  relativeTime,
  shortDateTime,
} from "./lib/format";

const BUCKET_ORDER = ["Today", "This Week", "This Month", "This Year", "Older"];

export default function BrowseBackup() {
  const cfg = useCached<DejaConfig>("config", readConfig);
  const snaps = useCached<Snapshot[]>("snapshots", listSnapshots);

  useEffect(() => {
    if (snaps.data) pruneOrphanIndexes(snaps.data.map((s) => s.short_id));
  }, [snaps.data]);

  const error = cfg.error || snaps.error;
  if (error && !snaps.data) return <ErrorView message={error} />;

  const config = cfg.data;
  const snapshots = snaps.data ?? [];

  const grouped = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const bucket = recencyBucket(s.time);
    (grouped.get(bucket) ?? grouped.set(bucket, []).get(bucket)!).push(s);
  }

  return (
    <List
      isLoading={snaps.isLoading}
      searchBarPlaceholder="Filter snapshots…"
      isShowingDetail
    >
      <List.EmptyView
        title={snaps.isFirstLoad ? "Loading snapshots…" : "No snapshots found"}
        description={
          snaps.isFirstLoad
            ? "Reading your backup — the first load can take a few seconds."
            : "This backup has no snapshots yet."
        }
        icon={Icon.Cloud}
      />
      {BUCKET_ORDER.filter((b) => grouped.has(b)).map((bucket) => (
        <List.Section key={bucket} title={bucket} subtitle={`${grouped.get(bucket)!.length}`}>
          {grouped.get(bucket)!.map((s) => (
            <SnapshotItem key={s.id} snapshot={s} config={config} />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

function SnapshotItem({ snapshot: s, config }: { snapshot: Snapshot; config: DejaConfig | null }) {
  return (
    <List.Item
      title={shortDateTime(s.time)}
      icon={{ source: Icon.Clock, tintColor: Color.Blue }}
      detail={<SnapshotDetail snapshot={s} />}
      actions={
        config ? (
          <ActionPanel>
            <Action.Push
              title="Browse Files"
              icon={Icon.Folder}
              target={<BrowseGate config={config} snapshot={s} />}
            />
            <Action.CopyToClipboard title="Copy Snapshot ID" content={s.id} />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}

function SnapshotDetail({ snapshot: s }: { snapshot: Snapshot }) {
  const M = List.Item.Detail.Metadata;
  const sum = s.summary;
  const dur = duration(sum?.backup_start, sum?.backup_end);
  return (
    <List.Item.Detail
      metadata={
        <M>
          <M.Label title="Snapshot" text={s.short_id} icon={{ source: Icon.Clock, tintColor: Color.Blue }} />
          <M.Label title="Taken" text={fullDate(s.time)} icon={Icon.Calendar} />
          {dur && <M.Label title="Duration" text={dur} icon={Icon.Clock} />}
          <M.Label title="Host" text={s.hostname} icon={Icon.HardDrive} />
          <M.Label title="User" text={s.username} icon={Icon.Person} />
          {s.program_version && <M.Label title="Engine" text={s.program_version} icon={Icon.Cog} />}
          <M.Separator />
          {sum?.total_files_processed != null && (
            <M.Label title="Files" text={sum.total_files_processed.toLocaleString()} icon={Icon.BlankDocument} />
          )}
          {sum?.total_bytes_processed != null && (
            <M.Label title="Total Size" text={formatBytes(sum.total_bytes_processed)} icon={Icon.Cloud} />
          )}
          {sum?.data_added != null && sum.data_added > 0 && (
            <M.Label title="New Data" text={formatBytes(sum.data_added)} icon={Icon.Upload} />
          )}
          {(sum?.files_new != null || sum?.files_changed != null) && (
            <M.TagList title="Changes">
              {sum?.files_new ? <M.TagList.Item text={`${sum.files_new.toLocaleString()} new`} color={Color.Green} /> : null}
              {sum?.files_changed ? <M.TagList.Item text={`${sum.files_changed.toLocaleString()} changed`} color={Color.Orange} /> : null}
              {sum?.files_unmodified ? <M.TagList.Item text={`${sum.files_unmodified.toLocaleString()} unchanged`} color={Color.SecondaryText} /> : null}
            </M.TagList>
          )}
          <M.Separator />
          <M.TagList title="Paths">
            {s.paths.map((p) => (
              <M.TagList.Item key={p} text={p} color={Color.Green} />
            ))}
          </M.TagList>
          {s.tags && s.tags.length > 0 && (
            <M.TagList title="Tags">
              {s.tags.map((t) => (
                <M.TagList.Item key={t} text={t} color={Color.Purple} />
              ))}
            </M.TagList>
          )}
          <M.Label title="Full ID" text={s.id} />
        </M>
      }
    />
  );
}

interface BrowseNode {
  name: string;
  type: string;
  path: string;
  size?: number;
  mtime?: string;
}

type LoadFn = (path: string) => Promise<BrowseNode[]>;

function toBrowseNodes(entries: BrowseNode[]): BrowseNode[] {
  return entries.map((e) => ({
    name: e.name,
    type: e.type,
    path: e.path,
    size: e.size,
    mtime: e.mtime,
  }));
}

/**
 * Decides how to browse a snapshot: from a local index (instant) if one exists, otherwise
 * offers to build it once (making both browsing AND search instant) or to browse live via
 * restic (correct but several seconds per folder on a cloud backend).
 */
function BrowseGate({ config, snapshot }: { config: DejaConfig; snapshot: Snapshot }) {
  const rootPath = snapshot.paths.length === 1 ? snapshot.paths[0] : "/";
  const [mode, setMode] = useState<"checking" | "choose" | "building" | "index" | "live">(
    "checking",
  );
  const [progress, setProgress] = useState(0);
  const linesRef = useRef<string[]>([]);

  useEffect(() => {
    (async () => {
      if (await hasIndex(snapshot.short_id)) {
        linesRef.current = await loadIndex(snapshot.short_id);
        setMode("index");
      } else {
        setMode("choose");
      }
    })();
  }, []);

  async function build() {
    setMode("building");
    setProgress(0);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Building index…" });
    try {
      await buildFileIndex(
        snapshot,
        (c) => {
          setProgress(c);
          toast.message = `${c.toLocaleString()} files`;
        },
        config,
      );
      linesRef.current = await loadIndex(snapshot.short_id);
      toast.style = Toast.Style.Success;
      toast.title = "Instant browsing ready";
      setMode("index");
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Index build failed";
      toast.message = e instanceof Error ? e.message : String(e);
      setMode("choose");
    }
  }

  if (mode === "checking" || mode === "building") {
    const md =
      mode === "building"
        ? `# Building index…\n\nIndexed **${progress.toLocaleString()}** files.\n\nThis reads the snapshot once so browsing and search become instant. It can take up to a minute on a cloud backup.`
        : "# Loading…";
    return <Detail markdown={md} />;
  }

  if (mode === "choose") {
    return (
      <Detail
        navigationTitle={snapshot.short_id}
        markdown={[
          "# Browse this snapshot",
          "",
          "Reading a cloud backup folder-by-folder takes several seconds each time. Build a small",
          "local index of this snapshot **once** and browsing (and search) become instant and offline.",
          "",
          `Snapshot **${snapshot.short_id}** · ${snapshot.paths.join(", ")}`,
        ].join("\n")}
        actions={
          <ActionPanel>
            <Action title="Enable Instant Browsing (build Index)" icon={Icon.MagnifyingGlass} onAction={build} />
            <Action title="Browse Now (slower)" icon={Icon.Folder} onAction={() => setMode("live")} />
            <Action title="Open Déjà Dup" icon={Icon.Cog} onAction={launchDejaDup} />
          </ActionPanel>
        }
      />
    );
  }

  const load: LoadFn =
    mode === "index"
      ? (p) => Promise.resolve(toBrowseNodes(listDirFromLines(linesRef.current, p)))
      : (p) => listDir(snapshot.id, p, config).then(toBrowseNodes);

  return <FileBrowser load={load} mode={mode} config={config} snapshot={snapshot} path={rootPath} />;
}

function FileBrowser({
  load,
  mode,
  config,
  snapshot,
  path,
}: {
  load: LoadFn;
  mode: string;
  config: DejaConfig;
  snapshot: Snapshot;
  path: string;
}) {
  const { data, isLoading, isFirstLoad, error } = useCached<BrowseNode[]>(
    `browse:${mode}:${snapshot.id}:${path}`,
    () => load(path),
  );
  const nodes = data ?? [];

  if (error && !data) return <ErrorView message={error} />;

  const dirs = nodes.filter((n) => n.type === "dir");
  const files = nodes.filter((n) => n.type !== "dir");
  const title = path === "/" ? "/" : path;

  return (
    <List isLoading={isLoading} navigationTitle={title} searchBarPlaceholder="Filter files…">
      <List.EmptyView title={isFirstLoad ? "Loading…" : "Empty directory"} icon={Icon.Folder} />
      <List.Section title="Folders" subtitle={dirs.length ? `${dirs.length}` : undefined}>
        {dirs.map((n) => (
          <FileItem key={n.path} node={n} load={load} mode={mode} config={config} snapshot={snapshot} />
        ))}
      </List.Section>
      <List.Section title="Files" subtitle={files.length ? `${files.length}` : undefined}>
        {files.map((n) => (
          <FileItem key={n.path} node={n} load={load} mode={mode} config={config} snapshot={snapshot} />
        ))}
      </List.Section>
    </List>
  );
}

function FileItem({
  node,
  load,
  mode,
  config,
  snapshot,
}: {
  node: BrowseNode;
  load: LoadFn;
  mode: string;
  config: DejaConfig;
  snapshot: Snapshot;
}) {
  const isDir = node.type === "dir";
  return (
    <List.Item
      title={node.name}
      icon={
        isDir
          ? { source: Icon.Folder, tintColor: Color.Blue }
          : { source: Icon.BlankDocument, tintColor: Color.SecondaryText }
      }
      accessories={
        isDir
          ? []
          : [
              ...(node.mtime ? [{ text: relativeTime(node.mtime) }] : []),
              { tag: formatBytes(node.size) },
            ]
      }
      actions={
        <FileActions node={node} load={load} mode={mode} config={config} snapshot={snapshot} />
      }
    />
  );
}

function FileActions({
  node,
  load,
  mode,
  config,
  snapshot,
}: {
  node: BrowseNode;
  load: LoadFn;
  mode: string;
  config: DejaConfig;
  snapshot: Snapshot;
}) {
  if (node.type === "dir") {
    return (
      <ActionPanel>
        <Action.Push
          title="Open Folder"
          icon={Icon.Folder}
          target={
            <FileBrowser load={load} mode={mode} config={config} snapshot={snapshot} path={node.path} />
          }
        />
        <RestoreActions config={config} snapshot={snapshot} node={node} />
      </ActionPanel>
    );
  }
  return (
    <ActionPanel>
      <Action title="Preview File" icon={Icon.Eye} onAction={() => previewFile(config, snapshot, node)} />
      <RestoreActions config={config} snapshot={snapshot} node={node} />
      <Action.CopyToClipboard title="Copy Path" content={node.path} />
    </ActionPanel>
  );
}

function RestoreActions({
  config,
  snapshot,
  node,
}: {
  config: DejaConfig;
  snapshot: Snapshot;
  node: BrowseNode;
}) {
  return (
    <>
      <Action
        title="Restore to Original Location"
        icon={Icon.ArrowClockwise}
        onAction={() => runRestore(config, snapshot, node.path, "/")}
      />
      <Action.Push
        title="Restore to…"
        icon={Icon.Download}
        target={<RestoreForm config={config} snapshot={snapshot} node={node} />}
      />
    </>
  );
}

function RestoreForm({
  config,
  snapshot,
  node,
}: {
  config: DejaConfig;
  snapshot: Snapshot;
  node: BrowseNode;
}) {
  const { pop } = useNavigation();
  const [target, setTarget] = useState(join(process.env.HOME || "/tmp", "Restored"));
  return (
    <Form
      navigationTitle={`Restore ${node.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Restore Here"
            icon={Icon.Download}
            onSubmit={async (values: Form.Values) => {
              const dest = (values.target as string) || target;
              await runRestore(config, snapshot, node.path, dest);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="target"
        title="Target Directory"
        value={target}
        onChange={setTarget}
        info="The file's original path is recreated inside this directory."
      />
      <Form.Description text={`Restoring: ${node.path}`} />
    </Form>
  );
}

async function previewFile(config: DejaConfig, snapshot: Snapshot, node: BrowseNode) {
  const toast = await showToast({ style: Toast.Style.Animated, title: `Fetching ${node.name}…` });
  try {
    const dest = join(environment.supportPath || tmpdir(), `preview-${basename(node.path)}`);
    await dumpFile(snapshot.id, node.path, dest, config);
    toast.style = Toast.Style.Success;
    toast.title = "Opening preview";
    await open(dest);
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Preview failed";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}

async function runRestore(config: DejaConfig, snapshot: Snapshot, path: string, targetDir: string) {
  const toast = await showToast({ style: Toast.Style.Animated, title: `Restoring ${basename(path)}…` });
  try {
    await restorePath(snapshot.id, path, targetDir, config);
    toast.style = Toast.Style.Success;
    toast.title = "Restored";
    toast.message = `${basename(path)} → ${targetDir}`;
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Restore failed";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}

export function launchDejaDup() {
  execFile("deja-dup", (err) => {
    if (err) showToast({ style: Toast.Style.Failure, title: "Could not launch Déjà Dup" });
  });
}

export function ErrorView({ message }: { message: string }) {
  return (
    <Detail
      markdown={`# Cannot read backup\n\n${message}`}
      actions={
        <ActionPanel>
          <Action title="Open Déjà Dup" icon={Icon.Cog} onAction={launchDejaDup} />
        </ActionPanel>
      }
    />
  );
}
