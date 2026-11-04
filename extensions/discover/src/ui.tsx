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
  environment,
  runInTerminal,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { join } from "node:path";
import type { Backend, Job, Plan, Software } from "./lib/types";
import { binary, message } from "./lib/system";
import { details } from "./lib/catalog";
import { pacmanPlan } from "./lib/pacman";
import { aurPlan } from "./lib/aur";
import { flatpakPlan } from "./lib/flatpak";
import { firmwarePlan } from "./lib/firmware";
import { listJobs, readLog, startJob } from "./lib/jobs";

export const labels: Record<Backend, string> = {
  pacman: "System packages",
  aur: "AUR",
  flatpak: "Flatpak",
  fwupd: "Firmware",
};
export const icons: Record<Backend, Icon> = {
  pacman: Icon.Box,
  aur: Icon.Code,
  flatpak: Icon.AppWindow,
  fwupd: Icon.ComputerChip,
};
export function useLoad<T>(loader: () => Promise<T>, dependencies: unknown[], initial: T) {
  const [value, setValue] = useState<T>(initial),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    Promise.resolve()
      .then(loader)
      .then((x) => {
        if (current) setValue(x);
      })
      .catch((e) => {
        if (current) setError(message(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, dependencies);
  return { value, loading, error };
}
export async function report(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Transaction could not be completed",
      message: message(error),
    });
  }
}
export function PlanAction({
  title,
  make,
  destructive = false,
}: {
  title: string;
  make: () => Promise<Plan> | Plan;
  destructive?: boolean;
}) {
  const { push } = useNavigation();
  const [busy, setBusy] = useState(false);
  return (
    <Action
      title={busy ? "Preparing transaction…" : title}
      icon={destructive ? Icon.Trash : Icon.Download}
      style={destructive ? "destructive" : "regular"}
      onAction={() => {
        if (busy) return;
        setBusy(true);
        void report(async () => {
          try {
            push(<PlanView plan={await make()} />);
          } finally {
            setBusy(false);
          }
        });
      }}
    />
  );
}
export function PlanView({ plan }: { plan: Plan }) {
  const { push } = useNavigation();
  const [busy, setBusy] = useState(false);
  const markdown = `# ${escapeMd(plan.title)}\n\n${plan.description}\n\n## Scope\n\n${
    plan.preview.length
      ? plan.preview
          .slice(0, 250)
          .map((x) => "- " + escapeMd(x))
          .join("\n")
      : "The package list will be resolved during the transaction."
  }${plan.preview.length > 250 ? `\n\n… and ${plan.preview.length - 250} more lines.` : ""}`;
  return (
    <Detail
      navigationTitle="Review Transaction"
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action
            title={busy ? "Starting…" : "Start Transaction"}
            icon={Icon.Play}
            onAction={() => {
              if (busy) return;
              void report(async () => {
                if (
                  !(await confirmAlert({
                    title: plan.title,
                    message: plan.description,
                    primaryAction: {
                      title: "Start",
                      style: plan.title.includes("Remove")
                        ? Alert.ActionStyle.Destructive
                        : Alert.ActionStyle.Default,
                    },
                  }))
                )
                  return;
                setBusy(true);
                try {
                  const job = await startJob(
                    plan,
                    join(environment.supportPath, "jobs"),
                    environment.assetsPath,
                    (args) => runInTerminal(args, { title: plan.title }),
                  );
                  push(<JobView id={job.id} />);
                } finally {
                  setBusy(false);
                }
              });
            }}
          />
          <Action.CopyToClipboard
            title="Copy Transaction Commands"
            content={plan.commands
              .map((c) => [c.file, ...c.args].map(shellDisplay).join(" "))
              .join("\n")}
          />
        </ActionPanel>
      }
    />
  );
}
function shellDisplay(s: string): string {
  return /^[a-zA-Z0-9_./:=@+-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'";
}
export function escapeMd(text: string): string {
  return text.replace(/[\\`*_[\]<>#]/g, "\\$&");
}
export function JobView({ id }: { id: string }) {
  const [tick, setTick] = useState(0);
  const root = join(environment.supportPath, "jobs");
  const job = listJobs(root).find((x) => x.id === id);
  const log = readLog(root, id);
  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const status = job ? statusLabel(job) : "Starting";
  return (
    <Detail
      navigationTitle={job?.title || "Transaction"}
      isLoading={job?.status === "queued" || job?.status === "running"}
      markdown={`# ${escapeMd(job?.title || "Transaction")}\n\n**${status}**${job?.error ? `\n\n${escapeMd(job.error)}` : ""}\n\nThis transaction continues after you close Vicinae. Check its result in Transaction History.\n\n\`\`\`text\n${log.replace(/```/g, "''' ")}\n\`\`\``}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Log" content={log} />
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => setTick(tick + 1)} />
        </ActionPanel>
      }
    />
  );
}
export function statusLabel(job: Job): string {
  return { queued: "Queued", running: "Running", success: "Completed", failed: "Failed" }[
    job.status
  ];
}
export function SoftwareActions({ item, onRefresh }: { item: Software; onRefresh?: () => void }) {
  return (
    <>
      <Action.Push
        title="View Details"
        icon={Icon.Info01}
        target={<SoftwareDetail item={item} />}
      />
      <PackageActions item={item} />
      {onRefresh && (
        <Action
          title="Refresh List"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["ctrl"], key: "r" }}
          onAction={onRefresh}
        />
      )}
      {item.backend === "aur" && (
        <Action.OpenInBrowser
          title="Open AUR Page and PKGBUILD"
          url={`https://aur.archlinux.org/packages/${encodeURIComponent(item.name)}`}
        />
      )}
      {item.url && /^https?:\/\//.test(item.url) && (
        <Action.OpenInBrowser title="Open Website" url={item.url} />
      )}
      <Action.CopyToClipboard title="Copy Package ID" content={item.ref || item.name} />
    </>
  );
}
function PackageActions({ item }: { item: Software }) {
  const install =
    item.backend === "pacman"
      ? () => pacmanPlan(item, "install")
      : item.backend === "aur"
        ? () => aurPlan(item)
        : () => flatpakPlan(item, "install");
  const remove =
    item.backend === "flatpak"
      ? () => flatpakPlan(item, "remove")
      : () => pacmanPlan(item, "remove");
  if (item.backend === "fwupd")
    return item.installedVersion && item.version !== item.installedVersion ? (
      <PlanAction title="Review Firmware Update" make={() => firmwarePlan(item)} />
    ) : null;
  return (
    <>
      {item.installed && item.backend === "flatpak" && (
        <Action
          title="Launch Application"
          icon={Icon.Play}
          onAction={() =>
            void report(async () => {
              const { spawn } = await import("node:child_process");
              const c = spawn(
                binary("flatpak")!,
                [
                  `--${item.scope!}`,
                  "run",
                  `--branch=${item.ref!.split("/")[3]}`,
                  `--arch=${item.ref!.split("/")[2]}`,
                  item.name,
                ],
                { stdio: "ignore", detached: true },
              );
              await new Promise<void>((resolve, reject) => {
                c.once("error", reject);
                c.once("spawn", () => {
                  c.unref();
                  resolve();
                });
              });
            })
          }
        />
      )}
      {item.installed && item.desktopId && (
        <Action
          title="Launch Application"
          icon={Icon.Play}
          onAction={() =>
            void report(async () => {
              const { run } = await import("./lib/system");
              await run("gtk-launch", [item.desktopId!.split("/").pop()!]);
            })
          }
        />
      )}
      {!item.installed && <PlanAction title="Review Installation" make={install} />}
      {item.installed && <PlanAction title="Review Removal" make={remove} destructive />}
    </>
  );
}
export function SoftwareDetail({ item }: { item: Software }) {
  const { value, loading, error } = useLoad(
    () => details(item, environment.assetsPath),
    [item.id],
    item,
  );
  const text = `# ${escapeMd(value.title)}\n\n${escapeMd(value.summary)}\n\n${value.description ? escapeMd(value.description) : ""}${error ? "\n\nCould not load information: " + escapeMd(error) : ""}\n\n${Object.entries(
    value.details || {},
  )
    .filter(([, v]) => v && v !== "None")
    .map(([k, v]) => `**${escapeMd(k)}:** ${escapeMd(v)}`)
    .join("\n\n")}${
    value.screenshots?.length
      ? "\n\n## Screenshots\n\n" +
        value.screenshots
          .filter((u) => /^https:\/\//.test(u))
          .map((u) => `![Application screenshot](${u.replace(/[()\s]/g, encodeURIComponent)})`)
          .join("\n\n")
      : ""
  }`;
  return (
    <Detail
      isLoading={loading}
      navigationTitle={value.title}
      markdown={text}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Source"
            text={labels[value.backend] + " · " + value.source}
          />
          <Detail.Metadata.Label title="Version" text={value.version || "Unknown"} />
          <Detail.Metadata.Label
            title="Status"
            text={value.installed ? "Installed" : "Not installed"}
          />
          {value.scope && (
            <Detail.Metadata.Label
              title="Scope"
              text={value.scope === "user" ? "User" : "System"}
            />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <PackageActions item={value} />
          {value.backend === "aur" && (
            <Action.OpenInBrowser
              title="AUR / PKGBUILD"
              url={`https://aur.archlinux.org/packages/${encodeURIComponent(value.name)}`}
            />
          )}
          <Action.CopyToClipboard title="Copy Package ID" content={value.ref || value.name} />
        </ActionPanel>
      }
    />
  );
}
export function SoftwareRow({ item, onRefresh }: { item: Software; onRefresh: () => void }) {
  return (
    <List.Item
      id={item.id}
      title={item.title}
      subtitle={item.summary}
      icon={icons[item.backend]}
      keywords={[item.name, item.source]}
      accessories={[
        ...(item.installed ? [{ tag: { value: "Installed", color: Color.Green } }] : []),
        { text: item.version },
        { tag: item.scope ? `${item.source} · ${item.scope}` : item.source },
      ]}
      actions={
        <ActionPanel>
          <SoftwareActions item={item} onRefresh={onRefresh} />
        </ActionPanel>
      }
    />
  );
}
export function Warnings({ warnings }: { warnings: string[] }) {
  return warnings.length ? (
    <List.Section title="Source status">
      {warnings.map((warning, i) => (
        <List.Item
          key={i}
          title={warning.split(":")[0]}
          subtitle={warning}
          icon={Icon.Exclamationmark}
          actions={
            <ActionPanel>
              <Action.Push title="View Details" target={<Detail markdown={warning} />} />
            </ActionPanel>
          }
        />
      ))}
    </List.Section>
  ) : null;
}
