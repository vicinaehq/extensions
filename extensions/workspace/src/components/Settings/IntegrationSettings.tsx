import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@vicinae/api";

interface IntegrationSettingsProps {
  fzfAvailable: boolean | null;
  gitAvailable: boolean | null;
  onWorkspacesChanged?: () => Promise<void>;
  showFzfStatus: boolean;
  showGitStatus: boolean;
  updateShowFzfStatus: (show: boolean) => Promise<void>;
  updateShowGitStatus: (show: boolean) => Promise<void>;
}

export default function IntegrationSettings({
  fzfAvailable,
  gitAvailable,
  onWorkspacesChanged,
  showFzfStatus,
  showGitStatus,
  updateShowFzfStatus,
  updateShowGitStatus,
}: IntegrationSettingsProps) {
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

  const gitStatusLabel =
    gitAvailable === null ? "Checking…" : gitAvailable ? "Installed" : "Not installed";
  const fzfStatusLabel =
    fzfAvailable === null ? "Checking…" : fzfAvailable ? "Installed" : "Not installed";

  return (
    <>
      <List.Item
        actions={
          gitAvailable ? (
            <ActionPanel>
              <ActionPanel.Section title="Git Status">
                <Action
                  onAction={toggleGitStatus}
                  title={showGitStatus ? "Disable Git Status" : "Enable Git Status"}
                />
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
                  <List.Item.Detail.Metadata.TagList.Item
                    color={availabilityColor(gitAvailable)}
                    text={gitStatusLabel}
                  />
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
      <List.Item
        actions={
          fzfAvailable ? (
            <ActionPanel>
              <ActionPanel.Section title="fzf">
                <Action
                  onAction={() => updateShowFzfStatus(!showFzfStatus)}
                  title={showFzfStatus ? "Disable FZF Search" : "Enable FZF Search"}
                />
              </ActionPanel.Section>
            </ActionPanel>
          ) : undefined
        }
        detail={
          <List.Item.Detail
            markdown={fzfDetailMarkdown(fzfAvailable)}
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.TagList title="fzf">
                  <List.Item.Detail.Metadata.TagList.Item
                    color={availabilityColor(fzfAvailable)}
                    text={fzfStatusLabel}
                  />
                </List.Item.Detail.Metadata.TagList>
                {fzfAvailable ? (
                  <List.Item.Detail.Metadata.TagList title="Use fzf">
                    <List.Item.Detail.Metadata.TagList.Item
                      color={showFzfStatus ? Color.Green : Color.SecondaryText}
                      text={showFzfStatus ? "Enabled" : "Disabled"}
                    />
                  </List.Item.Detail.Metadata.TagList>
                ) : null}
              </List.Item.Detail.Metadata>
            }
          />
        }
        icon={Icon.MagnifyingGlass}
        id="fzf"
        keywords={["fzf", "fuzzy", "search"]}
        title="fzf"
      />
    </>
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

function fzfDetailMarkdown(fzfAvailable: boolean | null): string {
  if (fzfAvailable === null) {
    return "Checking whether fzf is installed…";
  }

  if (fzfAvailable) {
    return "Use fzf for fuzzy project search when it is installed. Turn this off to fall back to substring matching.";
  }

  return "Install fzf to enable fuzzy search. Without it, search uses substring matching.";
}
