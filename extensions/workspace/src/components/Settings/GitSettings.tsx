import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@vicinae/api";

interface GitSettingsProps {
  gitAvailable: boolean | null;
  onWorkspacesChanged?: () => Promise<void>;
  showGitStatus: boolean;
  showStashCount: boolean;
  updateShowGitStatus: (show: boolean) => Promise<void>;
  updateShowStashCount: (show: boolean) => Promise<void>;
}

export default function GitSettings({
  gitAvailable,
  onWorkspacesChanged,
  showGitStatus,
  showStashCount,
  updateShowGitStatus,
  updateShowStashCount,
}: GitSettingsProps) {
  const toggleGitStatus = async () => {
    const newValue = !showGitStatus;
    await updateShowGitStatus(newValue);

    if (onWorkspacesChanged) {
      await onWorkspacesChanged();
    }

    await showToast({
      style: Toast.Style.Success,
      title: newValue ? "Git status enabled" : "Git status disabled",
    });
  };

  const toggleStashCount = async () => {
    const newValue = !showStashCount;
    await updateShowStashCount(newValue);

    if (onWorkspacesChanged) {
      await onWorkspacesChanged();
    }

    await showToast({
      style: Toast.Style.Success,
      title: newValue ? "Stash count enabled" : "Stash count disabled",
    });
  };

  const gitStatusLabel = gitAvailable === null ? "Checking…" : gitAvailable ? "Installed" : "Not installed";

  return (
    <List.Item
      actions={
        gitAvailable ? (
          <ActionPanel>
            <ActionPanel.Section title="Git Status">
              <Action
                icon={showGitStatus ? Icon.EyeDisabled : Icon.Eye}
                onAction={toggleGitStatus}
                title={showGitStatus ? "Disable Git Status" : "Enable Git Status"}
              />
              {showGitStatus ? (
                <Action
                  icon={showStashCount ? Icon.EyeDisabled : Icon.Eye}
                  onAction={toggleStashCount}
                  title={showStashCount ? "Hide Stash Count" : "Show Stash Count"}
                />
              ) : null}
            </ActionPanel.Section>
          </ActionPanel>
        ) : undefined
      }
      detail={
        <List.Item.Detail
          markdown={gitDetailMarkdown(gitAvailable)}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.TagList title="Git">
                <List.Item.Detail.Metadata.TagList.Item color={availabilityColor(gitAvailable)} text={gitStatusLabel} />
              </List.Item.Detail.Metadata.TagList>
              {gitAvailable ? (
                <>
                  <List.Item.Detail.Metadata.TagList title="Show status">
                    <List.Item.Detail.Metadata.TagList.Item
                      color={showGitStatus ? Color.Green : Color.SecondaryText}
                      text={showGitStatus ? "Enabled" : "Disabled"}
                    />
                  </List.Item.Detail.Metadata.TagList>
                  <List.Item.Detail.Metadata.TagList title="Stash count">
                    <List.Item.Detail.Metadata.TagList.Item
                      color={showStashCount ? Color.Green : Color.SecondaryText}
                      text={showStashCount ? "Enabled" : "Disabled"}
                    />
                  </List.Item.Detail.Metadata.TagList>
                </>
              ) : null}
            </List.Item.Detail.Metadata>
          }
        />
      }
      icon={Icon.Shuffle}
      id="git"
      keywords={["git", "branch", "status", "stash"]}
      title="Git"
    />
  );
}

function availabilityColor(available: boolean | null): Color {
  if (available === null) {
    return Color.SecondaryText;
  }

  return available ? Color.Green : Color.Red;
}

function gitDetailMarkdown(gitAvailable: boolean | null): string {
  if (gitAvailable === null) {
    return "Checking whether Git is installed…";
  }

  if (gitAvailable) {
    return "Show branch, modified/untracked files, clean state, ahead/behind, and optional stash count. Checkout, pull, remote, and commit log stay on the project actions. Tooltips include when status was last refreshed.";
  }

  return "Install Git to show branch and sync status on each project.";
}
