import { List } from "@vicinae/api";

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
    updateViewMode,
    updateWorkspaceApps,
    updateWorkspaces,
    viewMode,
    workspaceApps,
    workspaces,
  } = useWorkspace();

  return (
    <List
      navigationTitle={showGeneral ? "Workspace Settings" : "Manage Your Workspaces"}
      searchBarPlaceholder={showGeneral ? "Search settings..." : "Search for workspaces..."}
    >
      {showGeneral && (
        <>
          <GeneralSettings
            defaultApp={defaultApp}
            onExportSettings={exportSettings}
            onImportSettings={importSettings}
            terminalApp={terminalApp}
            updateDefaultApp={updateDefaultApp}
            updateTerminalApp={updateTerminalApp}
            updateViewMode={updateViewMode}
            viewMode={viewMode}
          />
          <RecentProjectsSettings
            recentProjectsCount={recentProjectsCount}
            showRecentProjects={showRecentProjects}
            updateRecentProjectsCount={updateRecentProjectsCount}
            updateShowRecentProjects={updateShowRecentProjects}
          />
          <IntegrationSettings
            fzfAvailable={fzfAvailable}
            gitAvailable={gitAvailable}
            onWorkspacesChanged={onWorkspacesChanged}
            showFzfStatus={showFzfStatus}
            showGitStatus={showGitStatus}
            updateShowFzfStatus={updateShowFzfStatus}
            updateShowGitStatus={updateShowGitStatus}
          />
        </>
      )}

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
