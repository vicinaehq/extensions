import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import DiscoverySettings from "@/components/Settings/DiscoverySettings";
import GeneralSettings from "@/components/Settings/GeneralSettings";
import GitSettings from "@/components/Settings/GitSettings";
import ManagedWorkspacesSection from "@/components/Settings/ManagedWorkspacesSection";
import RecentProjectsSettings from "@/components/Settings/RecentProjectsSettings";
import StatsSettings from "@/components/Settings/StatsSettings";
import TagsSettings from "@/components/Settings/TagsSettings";
import { useWorkspace } from "@/hooks/useWorkspace";

interface SettingsProps {
  onWorkspacesChanged?: () => Promise<void>;
  showGeneral?: boolean;
}

export default function Settings({ onWorkspacesChanged, showGeneral = true }: SettingsProps) {
  const {
    clearUsageStats,
    defaultApp,
    exportSettings,
    gitAvailable,
    ignorePatterns,
    importSettings,
    includeNested,
    loadData,
    projectTags,
    projects,
    recentProjectsCount,
    requireMarkers,
    resetExtension,
    scanDepth,
    showGitStatus,
    showRecentProjects,
    showStashCount,
    tags,
    terminalApp,
    updateDefaultApp,
    updateIgnorePatterns,
    updateIncludeNested,
    updateRecentProjectsCount,
    updateRequireMarkers,
    updateScanDepth,
    updateShowGitStatus,
    updateShowRecentProjects,
    updateShowStashCount,
    updateTerminalApp,
    updateWorkspaceApps,
    updateWorkspaces,
    usageSnapshot,
    workspaceApps,
    workspaces,
  } = useWorkspace();

  if (!showGeneral) {
    return (
      <List isShowingDetail navigationTitle="Manage Your Workspaces" searchBarPlaceholder="Search for workspaces...">
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
    workspaceCount === 0 ? "None added" : `${workspaceCount} workspace${workspaceCount === 1 ? "" : "s"}`;
  const gitRepoCount = projects.filter((project) => project.isGitRepo || project.gitStatus != null).length;

  return (
    <List isShowingDetail navigationTitle="Workspace Settings" searchBarPlaceholder="Search settings...">
      <List.Section subtitle="Apps, backup and reset" title="General">
        <GeneralSettings
          defaultApp={defaultApp}
          onExportSettings={exportSettings}
          onImportSettings={importSettings}
          onResetExtension={resetExtension}
          terminalApp={terminalApp}
          updateDefaultApp={updateDefaultApp}
          updateTerminalApp={updateTerminalApp}
        />
      </List.Section>
      <List.Section subtitle="Scan depth, markers and folders" title="Discovery">
        <DiscoverySettings
          ignorePatterns={ignorePatterns}
          includeNested={includeNested}
          onChanged={onWorkspacesChanged ?? loadData}
          requireMarkers={requireMarkers}
          scanDepth={scanDepth}
          updateIgnorePatterns={updateIgnorePatterns}
          updateIncludeNested={updateIncludeNested}
          updateRequireMarkers={updateRequireMarkers}
          updateScanDepth={updateScanDepth}
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
      <List.Section subtitle="Recents, git status and tags" title="Projects">
        <RecentProjectsSettings
          recentProjectsCount={recentProjectsCount}
          showRecentProjects={showRecentProjects}
          updateRecentProjectsCount={updateRecentProjectsCount}
          updateShowRecentProjects={updateShowRecentProjects}
        />
        <GitSettings
          gitAvailable={gitAvailable}
          onWorkspacesChanged={onWorkspacesChanged}
          showGitStatus={showGitStatus}
          showStashCount={showStashCount}
          updateShowGitStatus={updateShowGitStatus}
          updateShowStashCount={updateShowStashCount}
        />
        <TagsSettings projectTags={projectTags} tags={tags} />
      </List.Section>
      <List.Section subtitle="Usage and totals" title="Insights">
        <StatsSettings
          gitRepoCount={gitRepoCount}
          onClearUsage={clearUsageStats}
          projectCount={projects.length}
          snapshot={usageSnapshot}
          workspaceCount={workspaceCount}
        />
      </List.Section>
    </List>
  );
}
