import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@vicinae/api";

interface GitSettingsProps {
  gitAvailable: boolean | null;
  onWorkspacesChanged?: () => Promise<void>;
  showGitStatus: boolean;
  updateShowGitStatus: (show: boolean) => Promise<void>;
}

export default function GitSettings({
  gitAvailable,
  onWorkspacesChanged,
  showGitStatus,
  updateShowGitStatus,
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

  const gitStatusLabel = gitAvailable === null ? "Checking…" : gitAvailable ? "Installed" : "Not installed";

  return (
    <List.Item
      actions={
        gitAvailable ? (
          <ActionPanel>
            <ActionPanel.Section title="Git Status">
              <Action onAction={toggleGitStatus} title={showGitStatus ? "Disable Git Status" : "Enable Git Status"} />
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
                <List.Item.Detail.Metadata.TagList title="Show status">
                  <List.Item.Detail.Metadata.TagList.Item
                    color={showGitStatus ? Color.Green : Color.SecondaryText}
                    text={showGitStatus ? "Enabled" : "Disabled"}
                  />
                </List.Item.Detail.Metadata.TagList>
              ) : null}
            </List.Item.Detail.Metadata>
          }
        />
      }
      icon={Icon.Shuffle}
      id="git"
      keywords={["git", "branch", "status"]}
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
    return "Show branch, uncommitted files, and ahead/behind next to each project. Checkout, pull, and the commit log stay on the project actions.";
  }

  return "Install Git to show branch and sync status on each project.";
}
