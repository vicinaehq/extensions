import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import GeneralSettings from "@/components/Settings/GeneralSettings";
import IntegrationSettings from "@/components/Settings/IntegrationSettings";
import ManagedWorkspacesSection from "@/components/Settings/ManagedWorkspacesSection";
import RecentProjectsSettings from "@/components/Settings/RecentProjectsSettings";
import { useWorkspace } from "@/hooks/useWorkspace";

interface SettingsProps {
  onWorkspacesChanged?: () => Promise<void>;
  showGeneral?: boolean;
}

export default function Settings({ onWorkspacesChanged, showGeneral = true }: SettingsProps) {
  const {
    defaultApp,
    exportSettings,
    fzfAvailable,
    gitAvailable,
    importSettings,
    loadData,
    recentProjectsCount,
    showFzfStatus,
    showGitStatus,
    showRecentProjects,
    terminalApp,
    updateDefaultApp,
    updateRecentProjectsCount,
    updateShowFzfStatus,
    updateShowGitStatus,
    updateShowRecentProjects,
    updateTerminalApp,
    updateWorkspaceApps,
    updateWorkspaces,
    workspaceApps,
    workspaces,
  } = useWorkspace();

  if (!showGeneral) {
    return (
      <List
        isShowingDetail
        navigationTitle="Manage Your Workspaces"
        searchBarPlaceholder="Search for workspaces..."
      >
        <ManagedWorkspacesSection
          loadData={loadData}
          onWorkspacesChanged={onWorkspacesChanged}
          updateWorkspaceApps={updateWorkspaceApps}
          updateWorkspaces={updateWorkspaces}
          workspaceApps={workspaceApps}
          workspaces={workspaces}
        />
      </List>
    );
  }

  const workspaceCount = workspaces.length;
  const workspaceSummary =
    workspaceCount === 0
      ? "None added"
      : `${workspaceCount} workspace${workspaceCount === 1 ? "" : "s"}`;

  return (
    <List isShowingDetail navigationTitle="Workspace Settings" searchBarPlaceholder="Search settings...">
      <List.Section title="Settings">
        <GeneralSettings
          defaultApp={defaultApp}
          onExportSettings={exportSettings}
          onImportSettings={importSettings}
          terminalApp={terminalApp}
          updateDefaultApp={updateDefaultApp}
          updateTerminalApp={updateTerminalApp}
        />
        <RecentProjectsSettings
          recentProjectsCount={recentProjectsCount}
          showRecentProjects={showRecentProjects}
          updateRecentProjectsCount={updateRecentProjectsCount}
          updateShowRecentProjects={updateShowRecentProjects}
        />
        <List.Item
          actions={
            <ActionPanel>
              <Action.Push
                icon={Icon.Folder}
                target={<Settings onWorkspacesChanged={onWorkspacesChanged} showGeneral={false} />}
                title="Manage Workspaces"
              />
            </ActionPanel>
          }
          detail={
            <List.Item.Detail
              markdown="Add, remove, and reorder parent folders. You can also set a different app for each workspace."
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label title="Workspaces" text={workspaceSummary} />
                </List.Item.Detail.Metadata>
              }
            />
          }
          icon={Icon.Folder}
          id="workspaces"
          keywords={["folder", "directory", "manage"]}
          title="Workspaces"
        />
      </List.Section>
      <List.Section title="Integrations">
        <IntegrationSettings
          fzfAvailable={fzfAvailable}
          gitAvailable={gitAvailable}
          onWorkspacesChanged={onWorkspacesChanged}
          showFzfStatus={showFzfStatus}
          showGitStatus={showGitStatus}
          updateShowFzfStatus={updateShowFzfStatus}
          updateShowGitStatus={updateShowGitStatus}
        />
      </List.Section>
    </List>
  );
}
