import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  LaunchProps,
  useNavigation,
  Color,
  LaunchType,
} from "@vicinae/api";
import type { JJStatus } from "./utils/cli";
import { getWorkingCopyPath, execJJ, JJArguments } from "./utils/exec";
import { getJJStatus } from "./utils/status";
import { getJJLog, JJChange } from "./utils/log";
import { getJJBookmarks } from "./utils/bookmarks";
import {
  ClipboardAction,
  ViewStatusAction,
  ViewLogAction,
  EditDescriptionAction,
  NewChangeAction,
  ViewDiffAction,
  SquashChangesAction,
  SplitChangeAction,
  AbandonChangeAction,
  ResolveConflictsAction,
  UndoLastOperationAction,
  CopyChangeIdAction,
  TryAgainAction,
  InitializeRepoAction,
  OpenRepoAction,
} from "./components/actions";
import {
  SHORTCUTS,
} from "./utils/helpers";

// Enhanced JJ Dashboard with status overview and quick actions
export default function JJMainOperations(
  props: LaunchProps<{ arguments?: JJArguments }>,
) {
  const { "repo-path": repoPath } = props.arguments || {};
  const { push } = useNavigation();

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
  let repoStatus: JJStatus | null = null;
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
              <TryAgainAction repoPath={currentRepo!} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const repoName = currentRepo.split("/").pop() || currentRepo;
  const hasUncommittedChanges =
    repoStatus!.working_copy_changes.modified.length > 0 ||
    repoStatus!.working_copy_changes.added.length > 0 ||
    repoStatus!.working_copy_changes.removed.length > 0;

  const currentChange =
    recentChanges.find((change) => change.is_working_copy) || recentChanges[0];
  const hasDescription =
    currentChange?.description && currentChange.description.trim() !== "";

  return (
    <List>
      <List.Section title={`JJ Dashboard - ${repoName}`}>
        {/* Repository Status */}
        <List.Item
          title="Repository Status"
          subtitle={
            hasUncommittedChanges ? "Uncommitted changes" : "Clean working copy"
          }
          icon={hasUncommittedChanges ? Icon.Document : Icon.CheckCircle}
          accessories={[
            {
              text: {
                value: hasUncommittedChanges ? "Modified" : "Clean",
                color: hasUncommittedChanges ? Color.Orange : Color.Green,
              },
              icon: Icon.Dot,
            },
            {
              text: `${repoStatus!.working_copy_changes.modified.length + repoStatus!.working_copy_changes.added.length + repoStatus!.working_copy_changes.removed.length} files`,
              icon: Icon.Dot,
            },
          ]}
          actions={
            <ActionPanel>
              <ViewStatusAction repoPath={currentRepo!} />
              <ViewDiffAction repoPath={currentRepo!} />
            </ActionPanel>
          }
        />

        {/* Current Change */}
        <List.Item
          title="Current Change"
          subtitle={
            hasDescription
              ? currentChange!.description.split("\n")[0]
              : "No description"
          }
          icon={Icon.Pencil}
          accessories={[
            {
              text: repoStatus!.working_copy.change_id.slice(0, 8),
              icon: Icon.Dot,
            },
            {
              text: {
                value: hasDescription ? "Described" : "Needs Description",
                color: hasDescription ? Color.Green : Color.Yellow,
              },
              icon: Icon.Dot,
            },
          ]}
          actions={
            <ActionPanel>
              <EditDescriptionAction repoPath={currentRepo!} />
              <NewChangeAction repoPath={currentRepo!} />
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
              <ViewLogAction repoPath={currentRepo!} />
            </ActionPanel>
          }
        />

        <List.Item
          title="🔀 Change Operations"
          subtitle="Squash, split, or abandon changes"
          icon={Icon.ArrowUp}
          actions={
            <ActionPanel>
              <SquashChangesAction repoPath={currentRepo!} />
              <SplitChangeAction repoPath={currentRepo!} />
              <AbandonChangeAction repoPath={currentRepo!} />
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
              <ResolveConflictsAction repoPath={currentRepo!} />
              <UndoLastOperationAction repoPath={currentRepo!} />
            </ActionPanel>
          }
        />

        <List.Item
          title="📋 Repository Info"
          subtitle="Copy paths, view details"
          icon={Icon.Clipboard}
          actions={
            <ActionPanel>
              <ClipboardAction
                title="Copy Repository Path"
                value={currentRepo!}
                successTitle="Repository path copied!"
                shortcut={SHORTCUTS.COPY_REPO_PATH}
              />
              <CopyChangeIdAction changeId={repoStatus!.working_copy.change_id} repoPath={currentRepo!} />
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
    process.cwd(),
  ];

  const detectedRepos: string[] = [];

  for (const basePath of commonPaths) {
    try {
      const result = execJJ(`workspace list`, basePath);
      const workspaces = result.split("\n").filter((line) => line.trim());

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
              <InitializeRepoAction />
              <OpenRepoAction />
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
            title={repoPath.split("/").pop() || repoPath}
            subtitle={repoPath}
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action
                  title="Open Repository"
                  onAction={() =>
                    push(
                      <JJMainOperations
                        launchType={LaunchType.UserInitiated}
                        arguments={{ "repo-path": repoPath }}
                      />,
                    )
                  }
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
