import { Action, ActionPanel, Grid, Icon, List } from "@vicinae/api";
import path from "path";
import { useMemo, useState } from "react";

import Onboarding from "@/components/Onboarding";
import ProjectItem from "@/components/ProjectItem";
import Settings from "@/components/Settings";
import { useProjectSearch } from "@/hooks/useProjectSearch";
import { useWorkspace, WorkspaceProvider } from "@/hooks/useWorkspace";
import { Project, ViewMode } from "@/types";
import { organizeProjects } from "@/utils/projects";
import { toApp } from "@/utils/validation";

export default function Command() {
  return (
    <WorkspaceProvider>
      <WorkspaceCommand />
    </WorkspaceProvider>
  );
}

function WorkspaceCommand() {
  const {
    defaultApp,
    fzfAvailable,
    fzfPath,
    importSettings,
    isLoading,
    loadData,
    onboardingCompleted,
    onboardingHydrated,
    pinnedProjects,
    projects,
    recentProjects,
    recordProjectOpen,
    reorderPinnedProject,
    setOnboardingCompleted,
    showFzfStatus,
    showGitStatus,
    showRecentProjects,
    terminalApp,
    togglePinProject,
    toggleViewMode,
    updateDefaultApp,
    viewMode,
    workspaceApps,
    workspaces,
  } = useWorkspace();
  const [searchText, setSearchText] = useState("");
  const filteredProjects = useProjectSearch(projects, searchText, {
    fzfAvailable: Boolean(fzfAvailable),
    fzfPath,
    showFzfStatus,
    showGitStatus,
  });

  const { hasVisibleProjects, pinnedList, projectsByWorkspace, recentList } = useMemo(
    () =>
      organizeProjects({
        pinnedPaths: pinnedProjects,
        projects: filteredProjects,
        recentProjects,
        searchText,
        showRecentProjects,
        workspaces,
      }),
    [filteredProjects, pinnedProjects, recentProjects, searchText, showRecentProjects, workspaces],
  );

  const pinnedSet = useMemo(() => new Set(pinnedProjects), [pinnedProjects]);

  if (onboardingHydrated && !onboardingCompleted) {
    return (
      <Onboarding
        defaultApp={defaultApp}
        loadData={loadData}
        onComplete={() => setOnboardingCompleted(true)}
        onImportSettings={importSettings}
        onSelectDefaultApp={(app) => updateDefaultApp(toApp(app))}
        workspaces={workspaces}
      />
    );
  }

  const { Dropdown, DropdownItem, EmptyView, Section, View } = getViewComponents(viewMode);
  const listActions = <RefreshAndSettingsActions loadData={loadData} />;

  const renderProjects = (items: Project[], isPinned: boolean) =>
    items.map((project) => (
      <ProjectItem
        defaultApp={defaultApp}
        isPinned={isPinned || pinnedSet.has(project.fullPath)}
        key={project.fullPath}
        onOpen={recordProjectOpen}
        onRefresh={loadData}
        onReorderPin={reorderPinnedProject}
        onTogglePin={togglePinProject}
        project={project}
        showGitStatus={showGitStatus}
        terminalApp={terminalApp}
        viewMode={viewMode}
        workspaceApps={workspaceApps}
        workspacePath={project.parentFolder}
      />
    ));

  return (
    <View
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <Dropdown
          onChange={(val: string) => {
            if (val !== viewMode) toggleViewMode();
          }}
          tooltip="View Mode"
          value={viewMode}
        >
          <DropdownItem icon={Icon.AppWindowList} title="List" value="list" />
          <DropdownItem icon={Icon.AppWindowGrid3x3} title="Grid" value="grid" />
        </Dropdown>
      }
      searchBarPlaceholder="Search for projects..."
      throttle
    >
      {pinnedList.length > 0 && !searchText && <Section title="Pinned">{renderProjects(pinnedList, true)}</Section>}
      {recentList.length > 0 && !searchText && <Section title="Recent">{renderProjects(recentList, false)}</Section>}

      {workspaces.map((folder) => {
        const workspaceProjects = projectsByWorkspace[folder] ?? [];
        if (workspaceProjects.length === 0) return null;

        return (
          <Section
            key={folder}
            subtitle={`${folder} • ${workspaceProjects.length} project${workspaceProjects.length === 1 ? "" : "s"}`}
            title={path.basename(folder)}
          >
            {renderProjects(workspaceProjects, false)}
          </Section>
        );
      })}

      {workspaces.length === 0 && !isLoading && (
        <EmptyView
          actions={listActions}
          description="Add a workspace in Settings to see your projects."
          title="No Workspaces"
        />
      )}
      {workspaces.length > 0 && searchText && !isLoading && !hasVisibleProjects && (
        <EmptyView actions={listActions} description="Try a different search." title="No Matching Projects" />
      )}
      {workspaces.length > 0 && !isLoading && !searchText && !hasVisibleProjects && (
        <EmptyView
          actions={listActions}
          description="No folders found inside your workspaces. Add or manage workspaces in Settings."
          title="No Projects Found"
        />
      )}
    </View>
  );
}

function RefreshAndSettingsActions({ loadData }: { loadData: () => Promise<void> }) {
  return (
    <ActionPanel>
      <ActionPanel.Section title="Manage">
        <Action
          icon={Icon.ArrowClockwise}
          onAction={loadData}
          shortcut={{ key: "r", modifiers: ["cmd", "shift"] }}
          title="Refresh Projects"
        />
        <Action.Push target={<Settings onWorkspacesChanged={loadData} />} title="Open Settings" />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function getViewComponents(viewMode: ViewMode) {
  const root = viewMode === "grid" ? Grid : List;
  return {
    Dropdown: root.Dropdown,
    DropdownItem: root.Dropdown.Item,
    EmptyView: root.EmptyView,
    Section: root.Section,
    View: root,
  };
}
