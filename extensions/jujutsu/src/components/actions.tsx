import type { ComponentType, ReactElement, ReactNode } from "react";
import { ActionPanel, Action, Icon, Clipboard, showToast, type ImageLike, type KeyEquivalent, type KeyModifier, useNavigation, Form, Toast, LaunchType } from "@vicinae/api";
import { launchCommand, SHORTCUTS, withErrorHandling, getErrorMessage } from "../utils/helpers";
import { pushToGit, pullFromGit } from "../utils/git";
import { forgetBookmark } from "../utils/bookmarks";
import { execJJ } from "../utils/exec";
import { RepoPathValidationError, RepoPathValidationErrorDetail } from "./validation";
import type { LaunchProps } from "@vicinae/api";
import JJStatus from "../status";
import JJLog from "../log";
import JJBookmarks from "../bookmarks";
import JJDescribe from "../describe";
import JJNewChange from "../new-change";
import JJDiff from "../diff";
import JJSquash from "../squash";
import JJSplit from "../split";
import JJAbandon from "../abandon";
import JJResolve from "../resolve";
import JJUndo from "../undo";
import JJEdit from "../edit";
import JJMainOperations from "../main";

interface LaunchCommandActionProps {
  title: string;
  command: ComponentType<LaunchProps<any>>;
  repoPath: string;
  icon?: ImageLike;
  shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent };
  style?: (typeof Action.Style)[keyof typeof Action.Style];
}

export function LaunchCommandAction({
  title,
  command,
  repoPath,
  icon,
  shortcut,
  style,
}: LaunchCommandActionProps): ReactElement {
  const { push } = useNavigation();
  return (
    <Action
      title={title}
      onAction={() => launchCommand(push, command, { "repo-path": repoPath })}
      icon={icon}
      shortcut={shortcut}
      style={style}
    />
  );
}

interface ClipboardActionProps {
  title: string;
  value: string;
  successTitle: string;
  icon?: ImageLike;
  shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent };
}

export function ClipboardAction({
  title,
  value,
  successTitle,
  icon,
  shortcut,
}: ClipboardActionProps): ReactElement {
  return (
    <Action
      title={title}
      onAction={async () => {
        await Clipboard.copy(value);
        await showToast({ title: successTitle });
      }}
      icon={icon}
      shortcut={shortcut}
    />
  );
}

export function CopyChangeIdAction({ changeId, repoPath }: { changeId: string; repoPath: string }): ReactElement {
  return <ClipboardAction title="Copy Change ID" value={changeId} successTitle="Change ID copied!" icon={Icon.Clipboard} shortcut={SHORTCUTS.COPY_ID} />;
}

export function OpenInTerminalAction({ path, shortcut }: { path: string; shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent } }): ReactElement {
  return (
    <Action
      title="Open in Terminal"
      onAction={() => showToast({ title: "Opening terminal..." })}
      icon={Icon.Terminal}
      shortcut={shortcut}
    />
  );
}

export function OpenFileInEditorAction({ filePath, shortcut }: { filePath: string; shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent } }): ReactElement {
  return (
    <Action
      title="Edit File"
      onAction={() => showToast({ title: `Open ${filePath} in your editor` })}
      icon={Icon.Document}
      shortcut={shortcut}
    />
  );
}

export function GoToParentAction({ repoPath, shortcut }: { repoPath: string; shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent } }): ReactElement {
  return (
    <Action
      title="Go to Parent"
      onAction={async () => {
        execJJ("edit @-", repoPath);
        await showToast({ title: "Moved to parent change", style: Toast.Style.Success });
      }}
      icon={Icon.ArrowUp}
      shortcut={shortcut}
    />
  );
}

export function GoToChildAction({ repoPath, shortcut }: { repoPath: string; shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent } }): ReactElement {
  return (
    <Action
      title="Go to Child"
      onAction={async () => {
        execJJ("next --edit", repoPath);
        await showToast({ title: "Moved to next change", style: Toast.Style.Success });
      }}
      icon={Icon.ArrowDown}
      shortcut={shortcut}
    />
  );
}

interface GitSyncActionProps {
  title: string;
  operation: "pull-push" | "pull" | "push";
  repoPath: string;
  icon?: ImageLike;
  shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent };
}

export function GitSyncAction({
  title,
  operation,
  repoPath,
  icon,
  shortcut,
}: GitSyncActionProps): ReactElement {
  const operationMap = {
    "pull-push": async () => {
      await pullFromGit(repoPath);
      await pushToGit(undefined, repoPath);
    },
    pull: async () => {
      await pullFromGit(repoPath);
    },
    push: async () => {
      await pushToGit(undefined, repoPath);
    },
  };

  const successMessages = {
    "pull-push": "Pull & Push completed",
    pull: "Pull completed",
    push: "Push completed",
  };

  return (
    <Action
      title={title}
      onAction={withErrorHandling(operationMap[operation], successMessages[operation])}
      icon={icon}
      shortcut={shortcut}
    />
  );
}

interface AsyncActionProps {
  title: string;
  operation: () => Promise<void>;
  successTitle: string;
  icon?: ImageLike;
  shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent };
  style?: "regular" | "destructive";
}

export function AsyncAction({
  title,
  operation,
  successTitle,
  icon,
  shortcut,
  style,
}: AsyncActionProps): ReactElement {
  return (
    <Action
      title={title}
      onAction={withErrorHandling(operation, successTitle)}
      icon={icon}
      shortcut={shortcut}
      style={style}
    />
  );
}

interface DestructiveActionProps {
  title: string;
  operation: () => Promise<void>;
  successTitle: string;
  icon?: ImageLike;
  shortcut?: { modifiers: KeyModifier[]; key: KeyEquivalent };
}

export function DestructiveAsyncAction({
  title,
  operation,
  successTitle,
  icon,
  shortcut,
}: DestructiveActionProps): ReactElement {
  return (
    <Action
      title={title}
      onAction={withErrorHandling(operation, successTitle)}
      icon={icon}
      shortcut={shortcut}
      style={Action.Style.Destructive}
    />
  );
}

export function CopyIdAction({ id, idType }: { id: string; idType: string }): ReactElement {
  return <ClipboardAction title={`Copy ${idType}`} value={id} successTitle={`${idType} copied!`} shortcut={SHORTCUTS.COPY_ID} />;
}

export function ViewStatusAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="View Status..."
      command={JJStatus}
      repoPath={repoPath}
      icon={Icon.Info}
      shortcut={SHORTCUTS.VIEW_STATUS}
    />
  );
}

export function ViewLogAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="View Log..."
      command={JJLog}
      repoPath={repoPath}
      icon={Icon.Clock}
      shortcut={SHORTCUTS.VIEW_LOG}
    />
  );
}

export function ManageBookmarksAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Manage Bookmarks..."
      command={JJBookmarks}
      repoPath={repoPath}
      icon={Icon.Bookmark}
      shortcut={SHORTCUTS.MANAGE_BOOKMARKS}
    />
  );
}

export function CopyRepoPathAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <ClipboardAction
      title="Copy Repository Path"
      value={repoPath}
      successTitle="Repository path copied!"
      icon={Icon.Clipboard}
      shortcut={SHORTCUTS.COPY_REPO_PATH}
    />
  );
}

export function EditDescriptionAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Edit Description..."
      command={JJDescribe}
      repoPath={repoPath}
      icon={Icon.Pencil}
      shortcut={SHORTCUTS.EDIT_DESCRIPTION}
    />
  );
}

export function NewChangeAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="New Change..."
      command={JJNewChange}
      repoPath={repoPath}
      icon={Icon.Plus}
      shortcut={SHORTCUTS.NEW_CHANGE}
    />
  );
}

export function ViewDiffAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="View Diff..."
      command={JJDiff}
      repoPath={repoPath}
      icon={Icon.Eye}
      shortcut={SHORTCUTS.VIEW_DIFF}
    />
  );
}

export function TimeTravelAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Time Travel..."
      command={JJEdit}
      repoPath={repoPath}
      icon={Icon.ArrowRight}
      shortcut={SHORTCUTS.TIME_TRAVEL}
    />
  );
}

export function PullPushAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <GitSyncAction
      title="Pull & Push"
      operation="pull-push"
      repoPath={repoPath}
      icon={Icon.ArrowRightCircle}
      shortcut={SHORTCUTS.PULL_PUSH}
    />
  );
}

export function PullOnlyAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <GitSyncAction title="Pull Only" operation="pull" repoPath={repoPath} icon={Icon.ArrowDownCircle} shortcut={SHORTCUTS.PULL_ONLY} />
  );
}

export function PushOnlyAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <GitSyncAction title="Push Only" operation="push" repoPath={repoPath} icon={Icon.ArrowUpCircle} shortcut={SHORTCUTS.PUSH_ONLY} />
  );
}

export function SquashChangesAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Squash Changes..."
      command={JJSquash}
      repoPath={repoPath}
      icon={Icon.ChevronUp}
      shortcut={SHORTCUTS.SQUASH}
    />
  );
}

export function SplitChangeAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Split Change..."
      command={JJSplit}
      repoPath={repoPath}
      icon={Icon.ChevronDown}
      shortcut={SHORTCUTS.SPLIT}
    />
  );
}

export function AbandonChangeAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Abandon Change"
      command={JJAbandon}
      repoPath={repoPath}
      icon={Icon.Trash}
      style={Action.Style.Destructive}
      shortcut={SHORTCUTS.DELETE}
    />
  );
}

export function ResolveConflictsAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Resolve Conflicts..."
      command={JJResolve}
      repoPath={repoPath}
      icon={Icon.Warning}
      shortcut={SHORTCUTS.RESOLVE}
    />
  );
}

export function UndoLastOperationAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Undo Last Operation..."
      command={JJUndo}
      repoPath={repoPath}
      icon={Icon.Undo}
      shortcut={SHORTCUTS.UNDO}
    />
  );
}

export function TryAgainAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <LaunchCommandAction
      title="Try Again"
      command={JJMainOperations}
      repoPath={repoPath}
      icon={Icon.RotateClockwise}
    />
  );
}

export function InitializeRepoAction(): ReactElement {
  return (
    <Action
      title="Initialize Repository"
      onAction={() =>
        showToast({
          title: "Run 'jj git init .' in your project directory",
        })
      }
      icon={Icon.Plus}
    />
  );
}

export function OpenRepoAction(): ReactElement {
  return (
    <Action
      title="Open Repository"
      onAction={() =>
        showToast({ title: "Navigate to a JJ repository directory" })
      }
      icon={Icon.Folder}
    />
  );
}

export function PushItemAction({ changeId, repoPath }: { changeId: string; repoPath: string }): ReactElement {
  const { push } = useNavigation();
  return (
    <Action
      title="Edit This Change"
      onAction={() => {
        execJJ(`edit ${changeId}`, repoPath);
        showToast({
          title: `Switched to change ${changeId.slice(0, 8)}`,
          style: Toast.Style.Success
        });
        push(<JJEdit launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);
      }}
    />
  );
}

export function SearchChangesAction({ repoPath, onSubmit }: { repoPath: string; onSubmit: (query: string) => void }): ReactElement {
  const { push } = useNavigation();
  return (
    <Action
      title="Search Changes"
      onAction={() => push(<SearchChangeForm repoPath={repoPath} onSubmit={onSubmit} />)}
      shortcut={{ modifiers: ["ctrl"], key: "f" }}
    />
  );
}

function SearchChangeForm({ repoPath, onSubmit }: { repoPath: string; onSubmit: (query: string) => void }) {
  const handleSubmit = (values: Form.Values) => {
    const query = values.query as string;
    onSubmit(query);
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Search" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="query" title="Search Query" />
    </Form>
  );
}

export function StatusItemActions({ filePath, repoPath }: { filePath: string; repoPath: string }): ReactElement {
  return (
    <>
      <ClipboardAction
        title="Copy File Path"
        value={filePath}
        successTitle="Copied file path!"
        shortcut={{ modifiers: ["ctrl"], key: "c" }}
      />
      <OpenInTerminalAction path={filePath} shortcut={{ modifiers: ["ctrl"], key: "t" }} />
      <ActionPanel.Section />
      <ViewLogAction repoPath={repoPath} />
      <ViewDiffAction repoPath={repoPath} />
      <ManageBookmarksAction repoPath={repoPath} />
    </>
  );
}

export function BookmarkItemActions({ bookmarkName, changeId, repoPath }: { bookmarkName: string; changeId: string; repoPath: string }): ReactElement {
  return (
    <>
      <ActionPanel.Section>
        <CopyIdAction id={bookmarkName} idType="Bookmark Name" />
        <CopyIdAction id={changeId} idType="Change ID" />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <PushBookmarkAction bookmarkName={bookmarkName} repoPath={repoPath} />
        <TrackRemoteAction bookmarkName={bookmarkName} repoPath={repoPath} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <ForgetBookmarkAction bookmarkName={bookmarkName} repoPath={repoPath} />
        <DeleteBookmarkAction bookmarkName={bookmarkName} repoPath={repoPath} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <CreateBookmarkAction repoPath={repoPath} />
        <PushAllBookmarksAction repoPath={repoPath} />
      </ActionPanel.Section>
    </>
  );
}

export function ChangeItemActions({ changeId, commitId, repoPath }: { changeId: string; commitId: string; repoPath: string }): ReactElement {
  return (
    <>
      <ActionPanel.Section>
        <CopyIdAction id={changeId} idType="Change ID" />
        <CopyIdAction id={commitId} idType="Commit ID" />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <EditDescriptionAction repoPath={repoPath} />
        <NewChangeAction repoPath={repoPath} />
      </ActionPanel.Section>
    </>
  );
}

export function ResolveItemActions({ filePath, repo, operation }: { filePath: string; repo: string; operation: () => Promise<void> }): ReactElement {
  return (
    <>
      <AsyncAction
        title="Resolve"
        operation={operation}
        successTitle="Resolved successfully!"
        shortcut={{ modifiers: ["ctrl"], key: "enter" }}
      />
      <OpenFileInEditorAction filePath={filePath} shortcut={{ modifiers: ["ctrl"], key: "e" }} />
      <ViewDiffAction repoPath={repo} />
      <ViewStatusAction repoPath={repo} />
    </>
  );
}

export function DiffActions({ diff, repoPath }: { diff: string; repoPath: string }): ReactElement {
  return (
    <>
      <ClipboardAction
        title="Copy Diff"
        value={diff}
        successTitle="Copied diff to clipboard!"
        shortcut={{ modifiers: ["ctrl"], key: "c" }}
      />
      <NewChangeAction repoPath={repoPath} />
    </>
  );
}

export function PushBookmarkAction({ bookmarkName, repoPath }: { bookmarkName: string; repoPath: string }): ReactElement {
  return (
    <AsyncAction
      title="Push to Remote"
      operation={async () => {
        await pushToGit(bookmarkName, repoPath);
      }}
      successTitle="Pushed successfully"
      shortcut={SHORTCUTS.PUSH_BOOKMARK}
    />
  );
}

export function TrackRemoteAction({ bookmarkName, repoPath }: { bookmarkName: string; repoPath: string }): ReactElement {
  return (
    <AsyncAction
      title="Track Remote"
      operation={async () => {
        execJJ(`bookmark track ${bookmarkName}@origin`, repoPath);
      }}
      successTitle="Remote tracked"
      shortcut={SHORTCUTS.TRACK_REMOTE}
    />
  );
}

export function ForgetBookmarkAction({ bookmarkName, repoPath }: { bookmarkName: string; repoPath: string }): ReactElement {
  return (
    <AsyncAction
      title="Forget Bookmark"
      operation={async () => {
        forgetBookmark(bookmarkName, repoPath);
      }}
      successTitle="Bookmark forgotten"
      shortcut={SHORTCUTS.FORGET_BOOKMARK}
    />
  );
}

export function DeleteBookmarkAction({ bookmarkName, repoPath }: { bookmarkName: string; repoPath: string }): ReactElement {
  return (
    <DestructiveAsyncAction
      title="Delete Bookmark"
      operation={async () => {
        execJJ(`bookmark delete ${bookmarkName}`, repoPath);
      }}
      successTitle="Bookmark deleted"
      shortcut={SHORTCUTS.DELETE_BOOKMARK}
    />
  );
}

export function PushAllBookmarksAction({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <AsyncAction
      title="Push All Bookmarks"
      operation={async () => {
        await pushToGit(undefined, repoPath);
      }}
      successTitle="All bookmarks pushed"
      shortcut={SHORTCUTS.PUSH_ALL_BOOKMARKS}
    />
  );
}

export function CreateBookmarkAction({ repoPath }: { repoPath: string }): ReactElement {
  const { push } = useNavigation();
  return (
    <Action
      title="Create New Bookmark..."
      onAction={() => {
        push(<CreateBookmarkForm repoPath={repoPath} />);
      }}
      icon={Icon.Plus}
      shortcut={SHORTCUTS.CREATE_BOOKMARK}
    />
  );
}

function CreateBookmarkForm({ repoPath }: { repoPath: string }) {
  const { push } = useNavigation();

  const handleSubmit = async (values: Form.Values) => {
    const name = values.name as string;
    const revision = values.revision as string;
    try {
      const revArg = revision ? ` -r ${revision}` : "";
      execJJ(`bookmark create ${name}${revArg}`, repoPath);
      await showToast({
        title: "Bookmark created",
        message: `Created bookmark '${name}'`,
        style: Toast.Style.Success
      });
    } catch (error) {
      await showToast({
        title: "Failed to create bookmark",
        message: getErrorMessage(error),
        style: Toast.Style.Failure
      });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Bookmark" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        title="Bookmark Name"
        id="name"
      />
      <Form.TextField
        title="Revision (optional)"
        id="revision"
      />
    </Form>
  );
}

export function RepositoryActions({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <ActionPanel.Section title="Repository">
      <ViewStatusAction repoPath={repoPath} />
      <ViewLogAction repoPath={repoPath} />
      <ManageBookmarksAction repoPath={repoPath} />
      <CopyRepoPathAction repoPath={repoPath} />
    </ActionPanel.Section>
  );
}

export function ChangeActions({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <ActionPanel.Section title="Current Change">
      <EditDescriptionAction repoPath={repoPath} />
      <NewChangeAction repoPath={repoPath} />
      <ViewDiffAction repoPath={repoPath} />
      <TimeTravelAction repoPath={repoPath} />
    </ActionPanel.Section>
  );
}

export function SyncActions({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <ActionPanel.Section title="Sync">
      <PullPushAction repoPath={repoPath} />
      <PullOnlyAction repoPath={repoPath} />
      <PushOnlyAction repoPath={repoPath} />
    </ActionPanel.Section>
  );
}

export function AdvancedActions({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <ActionPanel.Section title="Advanced">
      <SquashChangesAction repoPath={repoPath} />
      <SplitChangeAction repoPath={repoPath} />
      <AbandonChangeAction repoPath={repoPath} />
      <ResolveConflictsAction repoPath={repoPath} />
      <UndoLastOperationAction repoPath={repoPath} />
    </ActionPanel.Section>
  );
}

export function CombinedActions({ repoPath }: { repoPath: string }): ReactElement {
  return (
    <ActionPanel>
      <RepositoryActions repoPath={repoPath} />
      <ChangeActions repoPath={repoPath} />
      <SyncActions repoPath={repoPath} />
      <AdvancedActions repoPath={repoPath} />
    </ActionPanel>
  );
}
