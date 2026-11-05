import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Detail,
  Icon,
  List,
  Toast,
  confirmAlert,
  open,
  showToast,
} from "@vicinae/api";
import {
  Change,
  Snapshot,
  SnapperConfig,
  StatusResult,
  deleteSnapshot,
  getDiff,
  getStatus,
  hasAccess,
  launchBtrfsAssistant,
  listConfigs,
  listSnapshots,
  snapshotMountPath,
} from "./lib/snapper";
import { useCached } from "./lib/cache";
import { fullDate, relativeTime } from "./lib/format";
import { runSetup } from "./lib/setup";

export default function BrowseSnapshots() {
  const [access, setAccess] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [gateError, setGateError] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    try {
      setAccess(await hasAccess());
    } catch (e) {
      setGateError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  const configs = useCached<SnapperConfig[]>("configs", listConfigs);

  if (gateError) return <ErrorView message={gateError} />;
  if (access === false) return <AccessGate onDone={check} />;

  const list = configs.data ?? [];

  return (
    <List isLoading={checking || configs.isLoading} searchBarPlaceholder="Filter configs…">
      <List.EmptyView
        title={checking ? "Checking access…" : "No Snapper configs"}
        description={checking ? undefined : "Btrfs Assistant / Snapper has no configs set up."}
        icon={Icon.HardDrive}
      />
      {list.map((c) => (
        <List.Item
          key={c.config}
          title={c.config}
          subtitle={c.subvolume}
          icon={{ source: Icon.HardDrive, tintColor: Color.Blue }}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Snapshots"
                icon={Icon.Camera}
                target={<SnapshotList config={c} />}
              />
              <Action title="Open Btrfs Assistant" icon={Icon.AppWindow} onAction={launchBtrfsAssistant} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function typeColor(t: string): Color {
  if (t === "pre") return Color.Orange;
  if (t === "post") return Color.Green;
  return Color.Blue;
}

function SnapshotList({ config }: { config: SnapperConfig }) {
  const { data, isLoading, isFirstLoad, error, revalidate } = useCached<Snapshot[]>(
    `snapshots:${config.config}`,
    () => listSnapshots(config.config),
  );
  const snaps = (data ?? []).filter((s) => s.number !== 0);

  if (error && !data) return <ErrorView message={error} />;

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Snapshots · ${config.config}`}
      searchBarPlaceholder="Filter snapshots…"
      isShowingDetail
    >
      <List.EmptyView title={isFirstLoad ? "Loading…" : "No snapshots"} icon={Icon.Camera} />
      {snaps.map((s) => (
        <List.Item
          key={s.number}
          title={`#${s.number}`}
          subtitle={relativeTime(s.date)}
          icon={{ source: Icon.Camera, tintColor: typeColor(s.type) }}
          accessories={[{ tag: { value: s.type, color: typeColor(s.type) } }]}
          detail={<SnapshotDetail snapshot={s} />}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Changed Files"
                icon={Icon.BulletPoints}
                target={<ChangeList config={config} snapshot={s} />}
              />
              <Action
                title="Delete Snapshot"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => onDelete(config, s.number, revalidate)}
              />
              <Action title="Open Btrfs Assistant" icon={Icon.AppWindow} onAction={launchBtrfsAssistant} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function SnapshotDetail({ snapshot: s }: { snapshot: Snapshot }) {
  const M = List.Item.Detail.Metadata;
  return (
    <List.Item.Detail
      metadata={
        <M>
          <M.Label title="Snapshot" text={`#${s.number}`} icon={{ source: Icon.Camera, tintColor: typeColor(s.type) }} />
          <M.TagList title="Type">
            <M.TagList.Item text={s.type} color={typeColor(s.type)} />
          </M.TagList>
          <M.Label title="Taken" text={fullDate(s.date)} icon={Icon.Calendar} />
          <M.Label title="User" text={s.user || "—"} icon={Icon.Person} />
          <M.Label title="Cleanup" text={s.cleanup || "—"} icon={Icon.Trash} />
          {s["pre-number"] ? <M.Label title="Pre-snapshot" text={`#${s["pre-number"]}`} /> : null}
          {s.description ? (
            <>
              <M.Separator />
              <M.Label title="Description" text={s.description} />
            </>
          ) : null}
        </M>
      }
    />
  );
}

interface DecodedChange {
  label: string;
  color: Color;
  icon: Icon;
  isContent: boolean;
}

function decodeChange(status: string): DecodedChange {
  const c = status[0];
  if (c === "+") return { label: "Created", color: Color.Green, icon: Icon.PlusCircle, isContent: false };
  if (c === "-") return { label: "Deleted", color: Color.Red, icon: Icon.MinusCircle, isContent: false };
  if (c === "t") return { label: "Type changed", color: Color.Purple, icon: Icon.Pencil, isContent: false };
  const extras: string[] = [];
  if (status[1] === "p") extras.push("permissions");
  if (status[2] === "u") extras.push("owner");
  if (status[3] === "g") extras.push("group");
  if (status[4] === "x") extras.push("xattrs");
  if (status[5] === "a") extras.push("ACL");
  if (c === "c") {
    return {
      label: extras.length ? `Content + ${extras.join(", ")}` : "Content changed",
      color: Color.Orange,
      icon: Icon.Pencil,
      isContent: true,
    };
  }
  return {
    label: extras.length ? `Changed ${extras.join(", ")}` : "Metadata changed",
    color: Color.Yellow,
    icon: Icon.Pencil,
    isContent: false,
  };
}

function ChangeList({ config, snapshot }: { config: SnapperConfig; snapshot: Snapshot }) {
  // Compare this snapshot against the current live system (number 0).
  const { data, isLoading, isFirstLoad, error } = useCached<StatusResult>(
    `status:${config.config}:${snapshot.number}`,
    () => getStatus(config.config, snapshot.number, 0),
  );
  const changes = data?.changes ?? [];
  const hadReadErrors = data?.hadReadErrors ?? false;

  if (error && !data) return <ErrorView message={error} />;

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`#${snapshot.number} → now`}
      searchBarPlaceholder="Filter changed files…"
      isShowingDetail
    >
      <List.EmptyView
        title={isFirstLoad ? "Computing diff…" : "No readable changes"}
        description={
          isFirstLoad
            ? undefined
            : hadReadErrors
              ? "Some paths in this config need root to read. Open Btrfs Assistant for a full comparison."
              : "Nothing changed since this snapshot."
        }
        icon={Icon.BulletPoints}
      />
      {changes.map((c) => {
        const d = decodeChange(c.status);
        const dir = c.path.slice(0, c.path.lastIndexOf("/")) || "/";
        const M = List.Item.Detail.Metadata;
        return (
          <List.Item
            key={c.path}
            title={c.path.split("/").pop() || c.path}
            icon={{ source: d.icon, tintColor: d.color }}
            detail={
              <List.Item.Detail
                metadata={
                  <M>
                    <M.TagList title="Change">
                      <M.TagList.Item text={d.label} color={d.color} />
                    </M.TagList>
                    <M.Label title="File" text={c.path.split("/").pop() || c.path} />
                    <M.Label title="Directory" text={dir} icon={Icon.Folder} />
                    <M.Separator />
                    <M.Label title="Full Path" text={c.path} />
                    <M.Label title="Compared" text={`#${snapshot.number} → now`} icon={Icon.Camera} />
                  </M>
                }
              />
            }
            actions={
              <ActionPanel>
                {d.isContent && (
                  <Action.Push
                    title="Show Diff"
                    icon={Icon.BulletPoints}
                    target={<DiffView config={config} snapshot={snapshot} path={c.path} />}
                  />
                )}
                <Action
                  title="Open Snapshot Version"
                  icon={Icon.Eye}
                  onAction={() => open(snapshotMountPath(config, snapshot.number) + c.path)}
                />
                <Action
                  title="Reveal in File Manager"
                  icon={Icon.Folder}
                  onAction={() =>
                    open(
                      (snapshotMountPath(config, snapshot.number) + c.path).replace(/\/[^/]*$/, "") ||
                        "/",
                    )
                  }
                />
                {c.status[0] !== "-" && (
                  <Action title="Open Current Version" icon={Icon.Clock} onAction={() => open(c.path)} />
                )}
                <Action.CopyToClipboard title="Copy Path" content={c.path} />
                <Action title="Open Btrfs Assistant" icon={Icon.AppWindow} onAction={launchBtrfsAssistant} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

function DiffView({
  config,
  snapshot,
  path,
}: {
  config: SnapperConfig;
  snapshot: Snapshot;
  path: string;
}) {
  const { data, isFirstLoad, error } = useCached<string>(
    `diff:${config.config}:${snapshot.number}:${path}`,
    () => getDiff(config.config, snapshot.number, 0, path),
  );
  const name = path.split("/").pop() || path;

  let md: string;
  if (error && !data) {
    md = `# ${name}\n\n${error}`;
  } else if (isFirstLoad && !data) {
    md = `# ${name}\n\nLoading diff…`;
  } else {
    const raw = data ?? "";
    const capped = raw.length > 60_000 ? raw.slice(0, 60_000) + "\n… (diff truncated)" : raw;
    md = capped.trim()
      ? `\`\`\`diff\n${capped}\n\`\`\``
      : `# ${name}\n\nNo textual differences (the file may be binary).`;
  }

  return (
    <Detail
      navigationTitle={name}
      markdown={md}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Path" content={path} />
          <Action title="Open Btrfs Assistant" icon={Icon.AppWindow} onAction={launchBtrfsAssistant} />
        </ActionPanel>
      }
    />
  );
}

async function onDelete(config: SnapperConfig, num: number, reload: () => void) {
  const ok = await confirmAlert({
    title: `Delete snapshot #${num}?`,
    message: "This permanently removes the snapshot.",
    primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
  });
  if (!ok) return;
  const toast = await showToast({ style: Toast.Style.Animated, title: `Deleting #${num}…` });
  try {
    await deleteSnapshot(config.config, num);
    toast.style = Toast.Style.Success;
    toast.title = `Deleted #${num}`;
    reload();
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Delete failed";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}

export function AccessGate({ onDone }: { onDone: () => void }) {
  const md = [
    "# Snapper access not set up",
    "",
    "This extension needs read access to Snapper. Snapper only allows `root` by default.",
    "",
    'Run **"Set Up Access"** below once — it asks for your admin password and grants your user',
    "passwordless read access (`ALLOW_USERS` + `SYNC_ACL`). After that, browsing works instantly.",
  ].join("\n");
  return (
    <Detail
      markdown={md}
      actions={
        <ActionPanel>
          <Action
            title="Set Up Access"
            icon={Icon.Key}
            onAction={async () => {
              const ok = await runSetup();
              if (ok) onDone();
            }}
          />
          <Action title="Open Btrfs Assistant" icon={Icon.AppWindow} onAction={launchBtrfsAssistant} />
        </ActionPanel>
      }
    />
  );
}

export function ErrorView({ message }: { message: string }) {
  return (
    <Detail
      markdown={`# Snapper error\n\n${message}`}
      actions={
        <ActionPanel>
          <Action title="Open Btrfs Assistant" icon={Icon.AppWindow} onAction={launchBtrfsAssistant} />
        </ActionPanel>
      }
    />
  );
}
