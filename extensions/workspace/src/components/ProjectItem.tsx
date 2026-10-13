import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Form,
  Icon,
  List,
  open,
  runInTerminal,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import path from "path";
import { useMemo, useState } from "react";

import CheckoutBranch from "@/components/Git/CheckoutBranch";
import CommitLog from "@/components/Git/CommitLog";
import ReadmeView from "@/components/ReadmeView";
import Settings from "@/components/Settings";
import { useTags } from "@/hooks/useTags";
import { App, GitStatus, Project } from "@/types";
import { SHORTCUT_MOVE_DOWN, SHORTCUT_MOVE_UP } from "@/utils/constants";
import { getCloneUrl, getRemoteUrl, pullGitBranch, pullsBrowserUrl } from "@/utils/git";
import { listItemId } from "@/utils/paths";
import { formatGitUpdatedAt, projectKeywords, projectListIcon } from "@/utils/projectDisplay";
import { TAG_COLORS } from "@/utils/tags";

interface ProjectItemProps {
  canMovePinDown?: boolean;
  canMovePinUp?: boolean;
  defaultApp: App | null;
  isPinned: boolean;
  onOpen?: (fullPath: string) => void;
  onRefresh: () => Promise<void>;
  onRefreshGit?: (fullPath: string) => Promise<void>;
  onReorderPin: (fullPath: string, direction: "down" | "up") => Promise<void>;
  onTogglePin: (fullPath: string) => Promise<void>;
  project: Project;
  showGitStatus: boolean;
  showStashCount?: boolean;
  terminalApp: App | null;
  workspaceApps: Record<string, App>;
  workspacePath: string;
}

export default function ProjectItem({
  canMovePinDown = false,
  canMovePinUp = false,
  defaultApp,
  isPinned,
  onOpen,
  onRefresh,
  onRefreshGit,
  onReorderPin,
  onTogglePin,
  project,
  showGitStatus,
  showStashCount = false,
  terminalApp,
  workspaceApps,
  workspacePath,
}: ProjectItemProps) {
  const { assignTag, createTag, getProjectTags, tags, unassignTag } = useTags();
  const projectTags = getProjectTags(project.fullPath);
  const workspaceApp = workspaceApps[workspacePath];
  const appToUse = workspaceApp || defaultApp;
  const [remoteBusy, setRemoteBusy] = useState(false);
  const assignedIds = useMemo(() => new Set(projectTags.map((tag) => tag.id)), [projectTags]);

  const accessories = useMemo(() => {
    const tagAccessories = projectTags.slice(0, 2).map((tag) => ({
      tag: { color: tag.color as Color, value: tag.name },
      tooltip: `Tag: ${tag.name}`,
    }));
    const gitAccessories =
      project.gitStatus && showGitStatus ? getGitAccessories(project.gitStatus, showStashCount) : [];
    return [...tagAccessories, ...gitAccessories];
  }, [project.gitStatus, projectTags, showGitStatus, showStashCount]);

  const openRemote = async () => {
    setRemoteBusy(true);
    try {
      const url = await getRemoteUrl(project.fullPath);
      if (!url) {
        await showToast({ style: Toast.Style.Failure, title: "No remote origin URL" });
        return;
      }
      await open(url);
    } finally {
      setRemoteBusy(false);
    }
  };

  const openPullRequests = async () => {
    setRemoteBusy(true);
    try {
      const url = await getRemoteUrl(project.fullPath);
      if (!url) {
        await showToast({ style: Toast.Style.Failure, title: "No remote origin URL" });
        return;
      }
      await open(pullsBrowserUrl(url));
    } finally {
      setRemoteBusy(false);
    }
  };

  const copyCloneUrl = async () => {
    setRemoteBusy(true);
    try {
      const url = await getCloneUrl(project.fullPath);
      if (!url) {
        await showToast({ style: Toast.Style.Failure, title: "No remote origin URL" });
        return;
      }
      await Clipboard.copy(url);
      await showToast({ message: url, style: Toast.Style.Success, title: "Clone URL copied" });
    } finally {
      setRemoteBusy(false);
    }
  };

  const refreshGit = async () => {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Refreshing git status…" });
    try {
      if (onRefreshGit) {
        await onRefreshGit(project.fullPath);
      } else {
        await onRefresh();
      }
      toast.style = Toast.Style.Success;
      toast.title = "Git status updated";
    } catch {
      toast.style = Toast.Style.Failure;
      toast.title = "Couldn't refresh git status";
    }
  };

  const availableTags = tags.filter((tag) => !assignedIds.has(tag.id));

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
        <Action.Push
          icon={Icon.BlankDocument}
          shortcut={{ key: "i", modifiers: ["cmd", "shift"] }}
          target={
            <ReadmeView
              appId={appToUse?.id}
              appName={appToUse?.name}
              projectName={project.name}
              projectPath={project.fullPath}
            />
          }
          title="Open README"
        />
        <Action
          icon={isPinned ? Icon.PinDisabled : Icon.Pin}
          onAction={() => onTogglePin(project.fullPath)}
          shortcut={{ key: "p", modifiers: ["ctrl", "shift"] }}
          title={isPinned ? "Unpin Project" : "Pin Project"}
        />
        {canMovePinUp && (
          <Action
            icon={Icon.ArrowUp}
            onAction={() => onReorderPin(project.fullPath, "up")}
            shortcut={SHORTCUT_MOVE_UP}
            title="Move Pin Up"
          />
        )}
        {canMovePinDown && (
          <Action
            icon={Icon.ArrowDown}
            onAction={() => onReorderPin(project.fullPath, "down")}
            shortcut={SHORTCUT_MOVE_DOWN}
            title="Move Pin Down"
          />
        )}
      </ActionPanel.Section>
      <ActionPanel.Section title="Tags">
        {availableTags.map((tag) => (
          <Action
            key={`add-${tag.id}`}
            icon={Icon.Tag}
            onAction={async () => {
              await assignTag(project.fullPath, tag.id);
              await showToast({ style: Toast.Style.Success, title: `Tagged ${tag.name}` });
            }}
            title={`Add Tag: ${tag.name}`}
          />
        ))}
        {projectTags.map((tag) => (
          <Action
            key={`remove-${tag.id}`}
            icon={Icon.XMarkCircle}
            onAction={async () => {
              await unassignTag(project.fullPath, tag.id);
              await showToast({ style: Toast.Style.Success, title: `Removed ${tag.name}` });
            }}
            title={`Remove Tag: ${tag.name}`}
          />
        ))}
        <Action.Push
          icon={Icon.Plus}
          shortcut={{ key: "t", modifiers: ["cmd", "shift"] }}
          target={<CreateAndAssignTagForm projectPath={project.fullPath} />}
          title="Create & Assign Tag…"
        />
      </ActionPanel.Section>
      {(project.isGitRepo || project.gitStatus) && (
        <ActionPanel.Section title="Git">
          <Action.Push
            icon={Icon.Shuffle}
            shortcut={{ key: "b", modifiers: ["cmd", "shift"] }}
            target={
              <CheckoutBranch
                onBranchChanged={onRefreshGit ? () => onRefreshGit(project.fullPath) : onRefresh}
                project={project}
              />
            }
            title="Checkout Branch…"
          />
          <Action
            icon={Icon.Download}
            onAction={async () => {
              const toast = await showToast({ style: Toast.Style.Animated, title: "Pulling changes…" });
              const result = await pullGitBranch(project.fullPath);
              if (result.ok) {
                toast.style = Toast.Style.Success;
                toast.title = "Pulled successfully";
                if (onRefreshGit) {
                  await onRefreshGit(project.fullPath);
                } else {
                  await onRefresh();
                }
              } else {
                toast.style = Toast.Style.Failure;
                toast.title = "Pull failed";
                toast.message = result.message;
              }
            }}
            shortcut={{ key: "u", modifiers: ["cmd", "shift"] }}
            title="Pull Changes"
          />
          <Action.Push
            icon={Icon.BulletPoints}
            shortcut={{ key: "l", modifiers: ["cmd", "shift"] }}
            target={<CommitLog project={project} />}
            title="View Commit Log…"
          />
          <Action
            icon={Icon.Globe01}
            onAction={openRemote}
            shortcut={{ key: "o", modifiers: ["cmd", "shift"] }}
            title={remoteBusy ? "Opening Remote…" : "Open Remote in Browser"}
          />
          <Action icon={Icon.Eye} onAction={openPullRequests} title="Open Pull Requests" />
          <Action icon={Icon.Link} onAction={copyCloneUrl} title="Copy Clone URL" />
          <Action
            icon={Icon.ArrowClockwise}
            onAction={refreshGit}
            shortcut={{ key: "g", modifiers: ["cmd", "shift"] }}
            title="Refresh Git Status"
          />
        </ActionPanel.Section>
      )}
      <ActionPanel.Section title="File">
        <Action.ShowInFinder
          icon={Icon.Finder}
          path={project.fullPath}
          shortcut={{ key: "e", modifiers: ["cmd", "shift"] }}
          title="Show in File Browser"
        />
        <Action.OpenWith icon={Icon.AppWindowList} path={project.fullPath} title="Open With…" />
      </ActionPanel.Section>
      <ActionPanel.Section title="Copy">
        <Action.CopyToClipboard content={project.name} icon={Icon.CopyClipboard} title="Copy Project Name" />
        <Action.CopyToClipboard
          content={project.fullPath}
          icon={Icon.CopyClipboard}
          shortcut={{ key: "c", modifiers: ["cmd", "shift"] }}
          title="Copy Project Path"
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Extension">
        <Action
          icon={Icon.ArrowClockwise}
          onAction={onRefresh}
          shortcut={{ key: "r", modifiers: ["cmd", "shift"] }}
          title="Refresh All Projects"
        />
        <Action.Push
          icon={Icon.Cog}
          shortcut={{ key: ",", modifiers: ["cmd", "shift"] }}
          target={<Settings onWorkspacesChanged={onRefresh} />}
          title="Open Workspace Settings…"
        />
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List.Item
      accessories={accessories}
      actions={actions}
      icon={projectListIcon(project)}
      id={listItemId(project.fullPath)}
      keywords={projectKeywords(project, showGitStatus, projectTags)}
      subtitle={path.dirname(project.fullPath)}
      title={project.name}
    />
  );
}

function CreateAndAssignTagForm({ projectPath }: { projectPath: string }) {
  const { assignTag, createTag } = useTags();
  const { pop } = useNavigation();
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(values: { color?: string; name?: string }) {
    const name = values.name?.trim() ?? "";
    if (!name) {
      setError("Required");
      return;
    }

    const color = (TAG_COLORS.find((entry) => entry.color === values.color)?.color ?? Color.Blue) as Color;
    const tag = await createTag(name, color);
    if (!tag) {
      setError("Could not create tag");
      return;
    }

    await assignTag(projectPath, tag.id);
    await showToast({ style: Toast.Style.Success, title: `Tagged ${tag.name}` });
    pop();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Tag} onSubmit={handleSubmit} title="Create & Assign" />
        </ActionPanel>
      }
      navigationTitle="Create Tag"
    >
      <Form.TextField
        error={error}
        id="name"
        onChange={() => setError(undefined)}
        placeholder="work, personal, client…"
        title="Name"
      />
      <Form.Dropdown defaultValue={Color.Blue} id="color" title="Color">
        {TAG_COLORS.map((entry) => (
          <Form.Dropdown.Item key={entry.color} title={entry.label} value={entry.color} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

function getGitAccessories(gitStatus: GitStatus, showStashCount: boolean) {
  const accessories: { tag: { color: Color; value: string }; tooltip: string }[] = [];
  const modified = gitStatus.modified ?? gitStatus.dirty ?? 0;
  const untracked = gitStatus.untracked ?? 0;
  const dirty = gitStatus.dirty ?? modified + untracked;
  const stash = gitStatus.stash ?? 0;

  if (dirty > 0) {
    if (modified > 0) {
      accessories.push({
        tag: { color: Color.Orange, value: String(modified) },
        tooltip: updatedTooltip(`${modified} modified file${modified === 1 ? "" : "s"}`, gitStatus.updatedAt),
      });
    }
    if (untracked > 0) {
      accessories.push({
        tag: { color: Color.SecondaryText, value: `?${untracked}` },
        tooltip: updatedTooltip(`${untracked} untracked file${untracked === 1 ? "" : "s"}`, gitStatus.updatedAt),
      });
    }
  }

  if (showStashCount && stash > 0) {
    accessories.push({
      tag: { color: Color.Blue, value: `stash ${stash}` },
      tooltip: `${stash} stash entr${stash === 1 ? "y" : "ies"}`,
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
    tooltip: updatedTooltip(`Branch: ${gitStatus.branch}`, gitStatus.updatedAt),
  });

  return accessories;
}

function updatedTooltip(base: string, updatedAt?: number): string {
  const age = formatGitUpdatedAt(updatedAt);
  return age ? `${base} · updated ${age}` : base;
}
