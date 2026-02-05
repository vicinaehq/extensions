import {
  Action,
  ActionPanel,
  confirmAlert,
  Detail,
  getApplications,
  Icon,
  List,
  showToast,
} from "@vicinae/api";
import { showFailureToast, useExec, usePromise } from "@raycast/utils";
import { execSync } from "node:child_process";
import { useMemo } from "react";
import { mullvadNotInstalledHint } from "./utils";
import {
  getIconForProcess,
  groupProcessesByCommand,
  hydrateCgroups,
  parseProcessesInfo,
  type GroupedProcess,
  type ProcessInfo,
} from "./process-utils";

type AppMetadata = {
  iconMap: Map<string, string>;
  commandSet: Set<string>;
  appCommandsKey: string;
};

function buildProcessListMarkdown(
  group: GroupedProcess,
  processMap: Map<string, ProcessInfo>,
): string {
  const lines = group.pids.map((pid) => {
    const proc = processMap.get(pid);
    if (!proc) return `- ${pid}`;
    return `- ${proc.command} (${pid})`;
  });

  return `## Processes\n${lines.join("\n")}`;
}

function useAppMetadata() {
  const appsPromise = usePromise(getApplications);

  const appMetadata = useMemo<AppMetadata>(() => {
    if (!appsPromise.data) {
      return { iconMap: new Map(), commandSet: new Set(), appCommandsKey: "" };
    }

    const iconMap = new Map<string, string>();
    const commandSet = new Set<string>();

    const addTokens = (str: string, isCommand = false, icon?: string) => {
      const lower = str.toLowerCase();
      if (isCommand) commandSet.add(lower);
      
      const tokens = lower.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
      for (const token of tokens) {
        if (isCommand) commandSet.add(token);
        if (icon && !iconMap.has(token)) iconMap.set(token, icon);
      }
    };

    for (const app of appsPromise.data) {
      const nameLower = app.name.toLowerCase();
      iconMap.set(nameLower, app.icon);
      
      // Add variants for name (both command and icon mapping)
      addTokens(app.name, true, app.icon);

      // Add variants for path/executable (command only)
      if (app.path) {
        const executable = app.path.split("/").pop();
        if (executable) {
           addTokens(executable, true);
        }
      }
    }

    const appCommandsKey = Array.from(commandSet).sort().join("|");
    return { iconMap, commandSet, appCommandsKey };
  }, [appsPromise.data]);

  return {
    appMetadata,
    appIconMap: appMetadata.iconMap,
    installedAppCommands: appMetadata.commandSet,
    appCommandsKey: appMetadata.appCommandsKey,
    isLoading: appsPromise.isLoading,
    error: appsPromise.error,
  };
}

export default function Command() {
  const {
    appIconMap,
    installedAppCommands,
    appCommandsKey,
    isLoading: isAppsLoading,
  } = useAppMetadata();

  const isMullvadInstalled = useExec("mullvad", ["--version"]);
  const rawSplitTunnelList = useExec("mullvad", ["split-tunnel", "list"], {
    execute: !!isMullvadInstalled.data,
  });

  const pids = useMemo(() => {
    const lines = (rawSplitTunnelList.data || "").split("\n");
    return lines
      .slice(1)
      .filter((line) => line.trim() && /^\d+$/.test(line.trim()))
      .map((line) => line.trim());
  }, [rawSplitTunnelList.data]);
  const pidsKey = useMemo(() => pids.join(","), [pids]);

  const processesPromise = usePromise(
    async (pidsKeyParam: string, commandsKeyParam: string) => {
      if (!pidsKeyParam || !commandsKeyParam)
        return new Map<string, ProcessInfo>();
      const map = await parseProcessesInfo(pids);
      if (installedAppCommands.size > 0) {
        await hydrateCgroups(map, installedAppCommands, 32);
      }
      return map;
    },
    [pidsKey, appCommandsKey],
  );
  const processMap =
    (processesPromise.data as Map<string, ProcessInfo> | undefined) ||
    new Map<string, ProcessInfo>();

  const groupedProcesses = useMemo<GroupedProcess[]>(
    () => groupProcessesByCommand(processMap, installedAppCommands),
    [processMap, installedAppCommands],
  );

  const isLoading =
    rawSplitTunnelList.isLoading ||
    isMullvadInstalled.isLoading ||
    isAppsLoading ||
    processesPromise.isLoading ||
    (pids.length > 0 && appCommandsKey.length === 0) ||
    (processMap.size === 0 && pids.length > 0);

  if (isLoading) return <List isLoading={true} />;
  if (!isMullvadInstalled.data || isMullvadInstalled.error)
    return <Detail markdown={mullvadNotInstalledHint} />;
  if (rawSplitTunnelList.error)
    return <Detail markdown={rawSplitTunnelList.error.message} />;

  async function removeProcessGroup(group: GroupedProcess) {
    const confirmed = await confirmAlert({
      title: `Remove ${group.command}?`,
      message: `This will remove ${group.pids.length} process${group.pids.length > 1 ? "es" : ""} from split-tunnel.`,
      icon: "mullvad-icon.png",
    });

    if (!confirmed) return;

    try {
      for (const pid of group.pids) {
        execSync(`mullvad split-tunnel delete ${pid}`);
      }
      showToast({
        title: `Removed ${group.command}`,
        message: `${group.pids.length} process${group.pids.length > 1 ? "es" : ""}`,
      });
      rawSplitTunnelList.revalidate();
    } catch (error) {
      if (error instanceof Error)
        showFailureToast({
          title: "Failed to remove processes",
          message: error.message,
        });
    }
  }

  async function clearAllSplitTunnel() {
    if (pids.length === 0) {
      showToast({ title: "Nothing to clear" });
      return;
    }

    const confirmed = await confirmAlert({
      title: "Clear All Excluded Processes?",
      message: `This will remove all ${pids.length} process${pids.length > 1 ? "es" : ""} from the split-tunnel list.`,
      icon: "mullvad-icon.png",
    });

    if (!confirmed) return;

    try {
      execSync("mullvad split-tunnel clear");
      showToast({ title: "Cleared all excluded processes" });
      rawSplitTunnelList.revalidate();
    } catch (error) {
      if (error instanceof Error)
        showFailureToast({
          title: "Failed to clear split-tunnel",
          message: error.message,
        });
    }
  }

  const hasProcesses = groupedProcesses.length > 0;
  const totalPids = pids.length;

  return (
    <List
      isLoading={rawSplitTunnelList.isLoading}
      searchBarPlaceholder="Search excluded processes..."
      isShowingDetail={hasProcesses}
    >
      {!hasProcesses ? (
        <List.EmptyView
          icon={Icon.CheckCircle}
          title="No Excluded Processes"
          description="All applications are using the VPN tunnel"
        />
      ) : (
        <List.Section
          title={`${groupedProcesses.length} Program${groupedProcesses.length > 1 ? "s" : ""} (${totalPids} process${totalPids > 1 ? "es" : ""})`}
        >
          {groupedProcesses.map((group: GroupedProcess) => (
            <List.Item
              key={group.pids.join(",")}
              icon={getIconForProcess(
                group,
                appIconMap,
                Icon.Terminal,
                Icon.XMarkCircle,
              )}
              title={group.command}
              keywords={[...group.pids, group.command, group.fullCommand]}
              accessories={[
                {
                  text: `${group.pids.length} process${group.pids.length > 1 ? "es" : ""}`,
                  icon: Icon.Hashtag,
                },
              ]}
              detail={
                <List.Item.Detail
                  markdown={buildProcessListMarkdown(group, processMap)}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label
                        title="Command"
                        text={group.command}
                        icon={Icon.Terminal}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Process Count"
                        text={`${group.pids.length}`}
                        icon={Icon.Hashtag}
                      />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label
                        title="Status"
                        text={group.isRunning ? "Running" : "Not Running"}
                        icon={group.isRunning ? Icon.CircleFilled : Icon.Circle}
                      />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label
                        title="PIDs"
                        text={group.pids.join(", ")}
                      />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label
                        title="Full Command"
                        text={group.fullCommand}
                      />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title={`Remove ${group.command}`}
                    icon={Icon.Trash}
                    onAction={() => removeProcessGroup(group)}
                    shortcut={{ modifiers: ["cmd"], key: "delete" }}
                  />
                  <Action.CopyToClipboard
                    content={group.pids.join(", ")}
                    title="Copy PIDs"
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    content={group.fullCommand}
                    title="Copy Full Command"
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                  <ActionPanel.Section>
                    <Action
                      title="Clear All Excluded Processes"
                      icon={Icon.XMarkCircle}
                      onAction={clearAllSplitTunnel}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
                      style={Action.Style.Destructive}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
