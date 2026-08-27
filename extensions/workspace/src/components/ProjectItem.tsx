import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  open,
  runInTerminal,
  showToast,
  Toast,
} from "@vicinae/api";
import path from "path";
import { useMemo } from "react";

import CheckoutBranch from "@/components/Git/CheckoutBranch";
import CommitLog from "@/components/Git/CommitLog";
import Settings from "@/components/Settings";
import { App, GitStatus, Project } from "@/types";
import { pullGitBranch } from "@/utils/git";

interface ProjectItemProps {
  defaultApp: App | null;
  isPinned: boolean;
  onOpen?: (fullPath: string) => void;
  onRefresh: () => Promise<void>;
  onReorderPin: (fullPath: string, direction: "down" | "up") => Promise<void>;
  onTogglePin: (fullPath: string) => Promise<void>;
  project: Project;
  showGitStatus: boolean;
  terminalApp: App | null;
  workspaceApps: Record<string, App>;
  workspacePath: string;
}

export default function ProjectItem({
  defaultApp,
  isPinned,
  onOpen,
  onRefresh,
  onReorderPin,
  onTogglePin,
  project,
  showGitStatus,
  terminalApp,
  workspaceApps,
  workspacePath,
}: ProjectItemProps) {
  const workspaceApp = workspaceApps[workspacePath];
  const appToUse = workspaceApp || defaultApp;

  const accessories = useMemo(() => {
    if (!project.gitStatus || !showGitStatus) return [];

    return getGitAccessories(project.gitStatus);
  }, [project.gitStatus, showGitStatus]);

  const actions = (
    <ActionPanel>
      <ActionPanel.Section title="Open">
        <Action
          icon={Icon.AppWindow}
          onAction={async () => {
            onOpen?.(project.fullPath);
            await open(project.fullPath, appToUse?.id);
          }}
          title={appToUse ? `Open in ${appToUse.name}` : "Open Project"}
        />
        <Action
          icon={Icon.Terminal}
          onAction={async () => {
            onOpen?.(project.fullPath);
            if (terminalApp) {
              await open(project.fullPath, terminalApp.id);
              return;
            }

            await runInTerminal([process.env.SHELL || "/bin/sh"], {
              hold: true,
              workingDirectory: project.fullPath,
            });
          }}
          shortcut={{ key: "enter", modifiers: ["cmd", "shift"] }}
          title="Open in Terminal"
        />
        <Action
          icon={isPinned ? Icon.PinDisabled : Icon.Pin}
          onAction={() => onTogglePin(project.fullPath)}
          shortcut={{ key: "p", modifiers: ["cmd", "shift"] }}
          title={isPinned ? "Unpin Project" : "Pin Project"}
        />
        {isPinned && (
          <>
            <Action
              icon={Icon.ArrowUp}
              onAction={() => onReorderPin(project.fullPath, "up")}
              shortcut={{ key: "arrowUp", modifiers: ["opt", "cmd"] }}
              title="Move Pinned Project Up"
            />
            <Action
              icon={Icon.ArrowDown}
              onAction={() => onReorderPin(project.fullPath, "down")}
              shortcut={{ key: "arrowDown", modifiers: ["opt", "cmd"] }}
              title="Move Pinned Project Down"
            />
          </>
        )}
      </ActionPanel.Section>
      {project.gitStatus && (
        <ActionPanel.Section title="Git">
          <Action.Push
            icon={Icon.Shuffle}
            shortcut={{ key: "b", modifiers: ["cmd", "shift"] }}
            target={<CheckoutBranch onBranchChanged={onRefresh} project={project} />}
            title="Checkout Branch"
          />
          <Action
            icon={Icon.Download}
            onAction={async () => {
              const toast = await showToast({ style: Toast.Style.Animated, title: "Pulling changes..." });
              const success = await pullGitBranch(project.fullPath);
              if (success) {
                toast.style = Toast.Style.Success;
                toast.title = "Pulled successfully";
                await onRefresh();
              } else {
                toast.style = Toast.Style.Failure;
                toast.title = "Failed to pull changes";
                toast.message = "Check for uncommitted changes or conflicts.";
              }
            }}
            shortcut={{ key: "u", modifiers: ["cmd", "shift"] }}
            title="Pull Changes"
          />
          <Action.Push
            icon={Icon.Terminal}
            shortcut={{ key: "l", modifiers: ["cmd", "shift"] }}
            target={<CommitLog project={project} />}
            title="View Commit Log"
          />
        </ActionPanel.Section>
      )}
      <ActionPanel.Section title="File">
        <Action.ShowInFinder
          path={project.fullPath}
          shortcut={{ key: "e", modifiers: ["cmd", "shift"] }}
          title="Show in File Browser"
        />
        <Action.OpenWith path={project.fullPath} title="Open with…" />
      </ActionPanel.Section>
      <ActionPanel.Section title="Copy">
        <Action.CopyToClipboard content={project.name} title="Copy Project Name" />
        <Action.CopyToClipboard
          content={project.fullPath}
          shortcut={{ key: "c", modifiers: ["cmd", "shift"] }}
          title="Copy Project Path"
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Settings">
        <Action
          icon={Icon.ArrowClockwise}
          onAction={onRefresh}
          shortcut={{ key: "r", modifiers: ["cmd", "shift"] }}
          title="Refresh Projects"
        />
        <Action.Push
          icon={Icon.Cog}
          shortcut={{ key: ",", modifiers: ["cmd", "shift"] }}
          target={<Settings onWorkspacesChanged={onRefresh} />}
          title="Workspace Settings"
        />
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List.Item
      accessories={accessories}
      actions={actions}
      icon={Icon.Folder}
      subtitle={isPinned ? path.dirname(project.fullPath) : ""}
      title={project.name}
    />
  );
}

function getGitAccessories(gitStatus: GitStatus) {
  const accessories: { tag: { color: Color; value: string }; tooltip: string }[] = [];

  if (gitStatus.dirty) {
    accessories.push({
      tag: { color: Color.SecondaryText, value: String(gitStatus.dirty) },
      tooltip: `${gitStatus.dirty} uncommitted change${gitStatus.dirty > 1 ? "s" : ""}`,
    });
  }

  const parts: string[] = [];

  if (gitStatus.pull) {
    parts.push(`${gitStatus.pull}↓`);
  }

  if (gitStatus.push) {
    parts.push(`${gitStatus.push}↑`);
  }

  parts.push(gitStatus.branch);

  const branchColor = gitStatus.push || gitStatus.pull ? Color.Orange : Color.Green;

  accessories.push({
    tag: { color: branchColor, value: parts.join(" ") },
    tooltip: `Branch: ${gitStatus.branch}`,
  });

  return accessories;
}
