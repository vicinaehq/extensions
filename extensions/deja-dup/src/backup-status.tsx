import { useEffect, useState } from "react";
import { Action, ActionPanel, Color, Detail, Icon, Toast, showToast } from "@vicinae/api";
import { execFile } from "node:child_process";
import { BackupStatus, RepoStats, readStatus, repoStats } from "./lib/deja-dup";
import { formatBytes, fullDate, relativeTime } from "./lib/format";
import { launchDejaDup } from "./browse-backup";

export default function BackupStatusView() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readStatus()
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    repoStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  const M = Detail.Metadata;

  const markdown = error
    ? `# Backup Status\n\n${error}`
    : status
      ? [
          "# Déjà Dup",
          "",
          `Last backup **${relativeTime(status.lastBackup)}**.`,
        ].join("\n")
      : "# Déjà Dup\n\nLoading status…";

  return (
    <Detail
      markdown={markdown}
      metadata={
        status ? (
          <M>
            <M.Label
              title="Last Backup"
              text={relativeTime(status.lastBackup)}
              icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
            />
            <M.Label title="When" text={fullDate(status.lastBackup)} icon={Icon.Calendar} />
            <M.Label title="Last Run" text={fullDate(status.lastRun)} icon={Icon.Clock} />
            <M.Separator />
            <M.Label title="Destination" text={status.folder} icon={Icon.Cloud} />
            <M.Label title="Backend" text={status.backend} icon={Icon.HardDrive} />
            <M.Label title="Engine" text={status.tool} icon={Icon.Cog} />
            <M.Label
              title="Schedule"
              text={status.periodic ? `Every ${status.periodicPeriod} day(s)` : "Manual"}
              icon={Icon.ArrowClockwise}
            />
            {stats && (stats.total_size || stats.snapshots_count) ? (
              <M.Label
                title="Repository"
                text={
                  formatBytes(stats.total_size) +
                  (stats.snapshots_count != null ? ` · ${stats.snapshots_count} snapshots` : "")
                }
                icon={Icon.Box}
              />
            ) : null}
            <M.Separator />
            {status.includeList.length > 0 && (
              <M.TagList title="Included">
                {status.includeList.map((p) => (
                  <M.TagList.Item key={p} text={p} color={Color.Green} />
                ))}
              </M.TagList>
            )}
            {status.excludeList.length > 0 && (
              <M.TagList title="Excluded">
                {status.excludeList.map((p) => (
                  <M.TagList.Item key={p} text={p} color={Color.Red} />
                ))}
              </M.TagList>
            )}
          </M>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action title="Back Up Now" icon={Icon.Upload} onAction={backupNow} />
          <Action title="Open Déjà Dup" icon={Icon.Cog} onAction={launchDejaDup} />
        </ActionPanel>
      }
    />
  );
}

async function backupNow() {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Starting backup…" });
  execFile("deja-dup", ["--backup"], (err) => {
    if (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not start backup";
      toast.message = err.message;
    } else {
      toast.style = Toast.Style.Success;
      toast.title = "Backup started in Déjà Dup";
    }
  });
}
