import type { ComponentType } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  LaunchProps,
  useNavigation,
  Color,
  Clipboard,
  Detail,
  Form,
  Toast,
  LaunchType,
} from "@vicinae/api";
import { getWorkingCopyPath, isJJRepo, execJJ, getJJStatus, getJJLog, getJJBookmarks, JJStatus as JJStatusType, JJChange, pushToGit, pullFromGit } from "./utils";
import JJResolve from "./resolve";
import JJEdit from "./edit";
import JJStatus from "./status";
import JJLog from "./log";
import JJDiff from "./diff";
import JJBookmarks from "./bookmarks";
import JJDescribe from "./describe";
import JJNewChange from "./new-change";
import JJSquash from "./squash";
import JJSplit from "./split";
import JJAbandon from "./abandon";
import JJUndo from "./undo";
import { RepositoryActions, ChangeActions, SyncActions, AdvancedActions, CombinedActions } from "./actions";

interface Arguments {
  "repo-path"?: string;
}

// Enhanced JJ Dashboard with status overview and quick actions
export default function JJMainOperations(props: LaunchProps<{ arguments?: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments || {};
  const { push, pop } = useNavigation();
  const launchCommand = (Component: ComponentType<LaunchProps<any>>, args: LaunchProps<any>["arguments"]) => {
    push(<Component launchType={LaunchType.UserInitiated} arguments={args} />);
  };

  // Try to detect current repository if not provided
  let currentRepo: string | null = repoPath || null;
  if (!currentRepo) {
    try {
      currentRepo = getWorkingCopyPath();
    } catch (error) {
      // Not in a JJ repo
    }
  }

  // If no repository found, show repository selection
  if (!currentRepo) {
    return <RepositorySelection />;
  }

  // Get current repository status
  let repoStatus: JJStatusType | null = null;
  let recentChanges: JJChange[] = [];
  let bookmarks: any[] = [];

  try {
    repoStatus = getJJStatus(currentRepo);
    recentChanges = getJJLog(5, currentRepo);
    bookmarks = getJJBookmarks(currentRepo);
  } catch (error) {
    return (
      <List>
        <List.Item
          title="Error reading repository"
          subtitle={`Could not read JJ repository at ${currentRepo}`}
          icon={Icon.Warning}
          actions={
            <ActionPanel>
              <Action
                title="Try Again"
                onAction={() => launchCommand(JJMainOperations, { "repo-path": currentRepo! })}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const repoName = currentRepo.split('/').pop() || currentRepo;
  const hasUncommittedChanges = repoStatus!.working_copy_changes.modified.length > 0 ||
                                repoStatus!.working_copy_changes.added.length > 0 ||
                                repoStatus!.working_copy_changes.removed.length > 0;

  const currentChange = recentChanges.find(change => change.is_working_copy) || recentChanges[0];
  const hasDescription = currentChange?.description && currentChange.description.trim() !== '';

  return (
    <List>
      <List.Section title={`JJ Dashboard - ${repoName}`}>
        {/* Repository Status */}
        <List.Item
          title="Repository Status"
          subtitle={hasUncommittedChanges ? "Uncommitted changes" : "Clean working copy"}
          icon={hasUncommittedChanges ? Icon.Document : Icon.CheckCircle}
          accessories={[
            {
              text: { value: hasUncommittedChanges ? "Modified" : "Clean", color: hasUncommittedChanges ? Color.Orange : Color.Green },
              icon: Icon.Dot
            },
            {
              text: `${repoStatus!.working_copy_changes.modified.length + repoStatus!.working_copy_changes.added.length + repoStatus!.working_copy_changes.removed.length} files`,
              icon: Icon.Dot
            }
          ]}
          actions={
            <ActionPanel>
              <Action
                title="View Full Status..."
                onAction={() => launchCommand(JJStatus, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl"], key: "s" }}
              />
              <Action
                title="View Diff..."
                onAction={() => launchCommand(JJDiff, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl"], key: "d" }}
              />
            </ActionPanel>
          }
        />

        {/* Current Change */}
        <List.Item
          title="Current Change"
          subtitle={hasDescription ? currentChange!.description.split('\n')[0] : "No description"}
          icon={Icon.Pencil}
          accessories={[
            {
              text: repoStatus!.working_copy.change_id.slice(0, 8),
              icon: Icon.Dot
            },
            {
              text: { value: hasDescription ? "Described" : "Needs Description", color: hasDescription ? Color.Green : Color.Yellow },
              icon: Icon.Dot
            }
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Edit Description..."
                onAction={() => launchCommand(JJDescribe, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl"], key: "e" }}
              />
              <Action
                title="New Change..."
                onAction={() => launchCommand(JJNewChange, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl"], key: "n" }}
              />
            </ActionPanel>
          }
        />

        {/* Recent Changes */}
        <List.Item
          title="Recent Changes"
          subtitle={`${recentChanges.length} recent changes`}
          icon={Icon.Clock}
          actions={
            <ActionPanel>
              <Action
                title="View Log..."
                onAction={() => launchCommand(JJLog, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl"], key: "l" }}
                />
              </ActionPanel>
            }
          />

        <List.Item
          title="🔀 Change Operations"
          subtitle="Squash, split, or abandon changes"
          icon={Icon.ArrowUp}
          actions={
            <ActionPanel>
              <Action
                title="Squash Changes..."
                onAction={() => launchCommand(JJSquash, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "q" }}
              />
              <Action
                title="Split Change..."
                onAction={() => launchCommand(JJSplit, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "t" }}
              />
              <Action
                title="Abandon Change"
                onAction={() => launchCommand(JJAbandon, { "repo-path": currentRepo! })}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl"], key: "delete" }}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      {/* Advanced Operations */}
      <List.Section title="Advanced">
        <List.Item
          title="⚙️ Repository Tools"
          subtitle="Resolve conflicts, undo operations"
          icon={Icon.Gear}
          actions={
            <ActionPanel>
              <Action
                title="Resolve Conflicts..."
                onAction={() => launchCommand(JJResolve, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
              />
              <Action
                title="Undo Last Operation..."
                onAction={() => launchCommand(JJUndo, { "repo-path": currentRepo! })}
                shortcut={{ modifiers: ["ctrl"], key: "z" }}
              />
            </ActionPanel>
          }
        />

        <List.Item
          title="📋 Repository Info"
          subtitle="Copy paths, view details"
          icon={Icon.Clipboard}
          actions={
            <ActionPanel>
              <Action
                title="Copy Repository Path"
                onAction={async () => {
                  await Clipboard.copy(currentRepo!);
                  await showToast({ title: "Repository path copied!" });
                }}
                shortcut={{ modifiers: ["ctrl"], key: "c" }}
              />
              <Action
                title="Copy Change ID"
                onAction={async () => {
                  await Clipboard.copy(repoStatus!.working_copy.change_id);
                  await showToast({ title: "Change ID copied!" });
                }}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

// Repository Selection Component
function RepositorySelection() {
  const { push } = useNavigation();

  // Find JJ repositories in common locations
  const commonPaths = [
    process.env.HOME + "/Projects",
    process.env.HOME + "/dev",
    process.env.HOME + "/code",
    process.cwd()
  ];

  const detectedRepos: string[] = [];

  for (const basePath of commonPaths) {
    try {
      const result = execJJ(`workspace list`, basePath);
      const workspaces = result.split('\n').filter(line => line.trim());

      for (const workspace of workspaces) {
        const match = workspace.match(/(\S+)\s+(.+)/);
        if (match) {
          const [, name, path] = match;
          if (!detectedRepos.includes(path)) {
            detectedRepos.push(path);
          }
        }
      }
    } catch (error) {
      // Skip if directory doesn't exist or no workspaces
    }
  }

  if (detectedRepos.length === 0) {
    return (
      <List>
        <List.Item
          title="No JJ repositories found"
          subtitle="Initialize a JJ repository or navigate to one"
          icon={Icon.Warning}
          actions={
            <ActionPanel>
              <Action
                title="Initialize Repository"
                onAction={() => showToast({ title: "Run 'jj git init .' in your project directory" })}
              />
              <Action
                title="Open Repository"
                onAction={() => showToast({ title: "Navigate to a JJ repository directory" })}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List>
      <List.Section title="Select JJ Repository">
        {detectedRepos.map((repoPath, index) => (
          <List.Item
            key={index}
            title={repoPath.split('/').pop() || repoPath}
            subtitle={repoPath}
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action
                  title="Open Repository"
                  onAction={() => push(<JJMainOperations launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}