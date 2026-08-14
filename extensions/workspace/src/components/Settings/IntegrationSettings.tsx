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

  return (
    <>
      <List.Section title="Integration - Git">
        <List.Item
          accessories={[
            {
              tag: {
                color: gitAvailable ? Color.Green : Color.Red,
                value: gitAvailable ? "Available" : "Not installed",
              },
            },
          ]}
          icon={Icon.Shuffle}
          subtitle={
            gitAvailable === null
              ? "Checking..."
              : gitAvailable
                ? "Branch and sync status shown per project"
                : "Install Git to see branch and sync status"
          }
          title="Git Integration"
        />
        {gitAvailable && (
          <List.Item
            accessories={[
              {
                tag: {
                  color: showGitStatus ? Color.Green : Color.SecondaryText,
                  value: showGitStatus ? "Enabled" : "Disabled",
                },
              },
            ]}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Git Status">
                  <Action
                    onAction={toggleGitStatus}
                    title={showGitStatus ? "Disable Git Status" : "Enable Git Status"}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
            icon={Icon.Shuffle}
            subtitle="Show branch and sync status in the list"
            title="Show Git Status"
          />
        )}
      </List.Section>

      <List.Section title="Integration - FZF">
        <List.Item
          accessories={[
            {
              tag: {
                color: fzfAvailable ? Color.Green : Color.Red,
                value: fzfAvailable ? "Available" : "Not installed",
              },
            },
          ]}
          icon={Icon.MagnifyingGlass}
          subtitle={
            fzfAvailable === null
              ? "Checking..."
              : fzfAvailable
                ? "Standard FZF search algorithm enabled"
                : "Install FZF to enable advanced fuzzy search"
          }
          title="FZF (Smart Search)"
        />
        {fzfAvailable && (
          <List.Item
            accessories={[
              {
                tag: {
                  color: showFzfStatus ? Color.Green : Color.SecondaryText,
                  value: showFzfStatus ? "Enabled" : "Disabled",
                },
              },
            ]}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Search">
                  <Action
                    onAction={() => updateShowFzfStatus(!showFzfStatus)}
                    title={showFzfStatus ? "Disable FZF Search" : "Enable FZF Search"}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
            icon={Icon.MagnifyingGlass}
            subtitle="Toggle fuzzy search for your projects"
            title="Use FZF for Search"
          />
        )}
      </List.Section>
    </>
  );
}
