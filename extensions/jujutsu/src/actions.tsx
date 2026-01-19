import type { ComponentType, ReactNode } from "react";
import { ActionPanel, Action, Icon, showToast, Toast, Clipboard, LaunchProps, LaunchType } from "@vicinae/api";
import JJStatus from "./status";
import JJLog from "./log";
import JJBookmarks from "./bookmarks";
import JJDescribe from "./describe";
import JJNewChange from "./new-change";
import JJDiff from "./diff";
import { pushToGit, pullFromGit } from "./utils";
import JJSquash from "./squash";
import JJSplit from "./split";
import JJAbandon from "./abandon";
import JJResolve from "./resolve";
import JJUndo from "./undo";
import JJEdit from "./edit";

const launchCommand = (push: (node: ReactNode) => void, Component: ComponentType<LaunchProps<any>>, args: LaunchProps<any>["arguments"]) => {
  push(<Component launchType={LaunchType.UserInitiated} arguments={args} />);
};

// Navigation helpers for consistent UX across commands
export class NavigationActions {
  static backToDashboard(push: (component: any) => void, repoPath: string) {
    return (
      <Action
        title="Back to Dashboard"
        onAction={() => {
          // Import here to avoid circular dependency
          const { default: JJMainOperations } = require("./main");
          launchCommand(push, JJMainOperations as ComponentType<LaunchProps<{ arguments?: { "repo-path"?: string } }>>, { "repo-path": repoPath });
        }}
        icon={Icon.ArrowLeft}
        shortcut={{ modifiers: ["ctrl"], key: "[" }}
      />
    );
  }

  static createCrossNavigation(repoPath: string, push: (component: any) => void, currentScreen?: string) {
    const actions = [];

    // Always include dashboard navigation
    actions.push(this.backToDashboard(push, repoPath));

    // Add separator
    actions.push(<ActionPanel.Section />);

    // Repository navigation
    actions.push(
      <ActionPanel.Section title="Repository">
        <Action
          title="View Status..."
          onAction={() => launchCommand(push, JJStatus, { "repo-path": repoPath })}
          icon={Icon.Info}
          shortcut={{ modifiers: ["ctrl"], key: "s" }}
        />
        <Action
          title="View Log..."
          onAction={() => launchCommand(push, JJLog, { "repo-path": repoPath })}
          icon={Icon.Clock}
          shortcut={{ modifiers: ["ctrl"], key: "l" }}
        />
        <Action
          title="Manage Bookmarks..."
          onAction={() => launchCommand(push, JJBookmarks, { "repo-path": repoPath })}
          icon={Icon.Bookmark}
          shortcut={{ modifiers: ["ctrl"], key: "b" }}
        />
      </ActionPanel.Section>
    );

    // Change operations
    actions.push(
      <ActionPanel.Section title="Current Change">
        <Action
          title="Edit Description..."
          onAction={() => launchCommand(push, JJDescribe, { "repo-path": repoPath })}
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["ctrl"], key: "e" }}
        />
        <Action
          title="New Change..."
          onAction={() => launchCommand(push, JJNewChange, { "repo-path": repoPath })}
          icon={Icon.Plus}
          shortcut={{ modifiers: ["ctrl"], key: "n" }}
        />
        <Action
          title="View Diff..."
          onAction={() => launchCommand(push, JJDiff, { "repo-path": repoPath })}
          icon={Icon.Eye}
          shortcut={{ modifiers: ["ctrl"], key: "d" }}
        />
        <Action
          title="Time Travel..."
          onAction={() => launchCommand(push, JJEdit, { "repo-path": repoPath })}
          icon={Icon.ArrowRight}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
        />
      </ActionPanel.Section>
    );

    // Sync operations
    actions.push(
      <ActionPanel.Section title="Sync">
        <Action
          title="Pull & Push"
          onAction={async () => {
            try {
              await pullFromGit(repoPath);
              await pushToGit(undefined, repoPath);
              await showToast({ title: "Pull & Push completed", style: Toast.Style.Success });
            } catch (error) {
              await showToast({ title: "Sync failed", message: error instanceof Error ? error.message : "Unknown error", style: Toast.Style.Failure });
            }
          }}
          icon={Icon.ArrowRightCircle}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
        />
        <Action
          title="Pull Only"
          onAction={async () => {
            try {
              await pullFromGit(repoPath);
              await showToast({ title: "Pull completed", style: Toast.Style.Success });
            } catch (error) {
              await showToast({ title: "Pull failed", message: error instanceof Error ? error.message : "Unknown error", style: Toast.Style.Failure });
            }
          }}
          icon={Icon.ArrowDownCircle}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
        />
        <Action
          title="Push Only"
          onAction={async () => {
            try {
              await pushToGit(undefined, repoPath);
              await showToast({ title: "Push completed", style: Toast.Style.Success });
            } catch (error) {
              await showToast({ title: "Push failed", message: error instanceof Error ? error.message : "Unknown error", style: Toast.Style.Failure });
            }
          }}
          icon={Icon.ArrowUpCircle}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "u" }}
        />
      </ActionPanel.Section>
    );

    return actions;
  }
}

// Repository-level actions shared across commands
export class RepositoryActions {
  static create(repoPath: string, push: (component: any) => void) {
    return (
      <ActionPanel.Section title="Repository">
        <Action
          title="View Status..."
          onAction={() => launchCommand(push, JJStatus, { "repo-path": repoPath })}
          icon={Icon.Info}
          shortcut={{ modifiers: ["ctrl"], key: "s" }}
        />
        <Action
          title="View Log..."
          onAction={() => launchCommand(push, JJLog, { "repo-path": repoPath })}
          icon={Icon.Clock}
          shortcut={{ modifiers: ["ctrl"], key: "l" }}
        />
        <Action
          title="Manage Bookmarks..."
          onAction={() => launchCommand(push, JJBookmarks, { "repo-path": repoPath })}
          icon={Icon.Bookmark}
          shortcut={{ modifiers: ["ctrl"], key: "b" }}
        />
        <Action
          title="Copy Repository Path"
          onAction={async () => {
            await Clipboard.copy(repoPath);
            await showToast({ title: "Repository path copied!" });
          }}
          icon={Icon.Clipboard}
          shortcut={{ modifiers: ["ctrl"], key: "c" }}
        />
      </ActionPanel.Section>
    );
  }
}

// Actions for working with changes (current change operations)
export class ChangeActions {
  static create(repoPath: string, push: (component: any) => void) {
    return (
      <ActionPanel.Section title="Current Change">
        <Action
          title="Edit Description..."
          onAction={() => launchCommand(push, JJDescribe, { "repo-path": repoPath })}
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["ctrl"], key: "e" }}
        />
        <Action
          title="New Change..."
          onAction={() => launchCommand(push, JJNewChange, { "repo-path": repoPath })}
          icon={Icon.Plus}
          shortcut={{ modifiers: ["ctrl"], key: "n" }}
        />
        <Action
          title="View Diff..."
          onAction={() => launchCommand(push, JJDiff, { "repo-path": repoPath })}
          icon={Icon.Eye}
          shortcut={{ modifiers: ["ctrl"], key: "d" }}
        />
        <Action
          title="Time Travel..."
          onAction={() => launchCommand(push, JJEdit, { "repo-path": repoPath })}
          icon={Icon.ArrowRight}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
        />
      </ActionPanel.Section>
    );
  }
}

// Actions for syncing with remote repositories
export class SyncActions {
  static create(repoPath: string, push: (component: any) => void) {
    return (
      <ActionPanel.Section title="Sync">
        <Action
          title="Pull & Push"
          onAction={async () => {
            try {
              await pullFromGit(repoPath);
              await pushToGit(undefined, repoPath);
              await showToast({ title: "Pull & Push completed", style: Toast.Style.Success });
            } catch (error) {
              await showToast({ title: "Sync failed", message: error instanceof Error ? error.message : "Unknown error", style: Toast.Style.Failure });
            }
          }}
          icon={Icon.ArrowRightCircle}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
        />
        <Action
          title="Pull Only"
          onAction={async () => {
            try {
              await pullFromGit(repoPath);
              await showToast({ title: "Pull completed", style: Toast.Style.Success });
            } catch (error) {
              await showToast({ title: "Pull failed", message: error instanceof Error ? error.message : "Unknown error", style: Toast.Style.Failure });
            }
          }}
          icon={Icon.ArrowDownCircle}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
        />
        <Action
          title="Push Only"
          onAction={async () => {
            try {
              await pushToGit(undefined, repoPath);
              await showToast({ title: "Push completed", style: Toast.Style.Success });
            } catch (error) {
              await showToast({ title: "Push failed", message: error instanceof Error ? error.message : "Unknown error", style: Toast.Style.Failure });
            }
          }}
          icon={Icon.ArrowUpCircle}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "u" }}
        />
      </ActionPanel.Section>
    );
  }
}

// Advanced operations that modify repository structure
export class AdvancedActions {
  static create(repoPath: string, push: (component: any) => void) {
    return (
      <ActionPanel.Section title="Advanced">
        <Action
          title="Squash Changes..."
          onAction={() => launchCommand(push, JJSquash, { "repo-path": repoPath })}
          icon={Icon.ChevronUp}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "q" }}
        />
        <Action
          title="Split Change..."
          onAction={() => launchCommand(push, JJSplit, { "repo-path": repoPath })}
          icon={Icon.ChevronDown}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "t" }}
        />
        <Action
          title="Abandon Change"
          onAction={() => launchCommand(push, JJAbandon, { "repo-path": repoPath })}
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "delete" }}
        />
        <Action
          title="Resolve Conflicts..."
          onAction={() => launchCommand(push, JJResolve, { "repo-path": repoPath })}
          icon={Icon.Warning}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
        />
        <Action
          title="Undo Last Operation..."
          onAction={() => launchCommand(push, JJUndo, { "repo-path": repoPath })}
          icon={Icon.Undo}
          shortcut={{ modifiers: ["ctrl"], key: "z" }}
        />
      </ActionPanel.Section>
    );
  }
}

// Combined action panel with all sections
export class CombinedActions {
  static create(repoPath: string, push: (component: any) => void) {
    return (
      <ActionPanel>
        {RepositoryActions.create(repoPath, push)}
        {ChangeActions.create(repoPath, push)}
        {SyncActions.create(repoPath, push)}
        {AdvancedActions.create(repoPath, push)}
      </ActionPanel>
    );
  }
}