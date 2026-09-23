import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import path from "path";
import { useMemo, useState } from "react";

import Onboarding from "@/components/Onboarding";
import ProjectItem from "@/components/ProjectItem";
import Settings from "@/components/Settings";
import { useWorkspace, WorkspaceProvider } from "@/hooks/useWorkspace";
import { Project } from "@/types";
import { listItemId } from "@/utils/paths";
import { matchesProjectFilter, type ProjectFilter } from "@/utils/projectDisplay";
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
    importSettings,
    isLoading,
    loadData,
    onboardingCompleted,
    onboardingHydrated,
    pinnedProjects,
    projectTags,
    projects,
    recentProjects,
    recentProjectsCount,
    recordProjectOpen,
    refreshProjectGit,
    reorderPinnedProject,
    setOnboardingCompleted,
    showGitStatus,
    showRecentProjects,
    showStashCount,
    tags,
    terminalApp,
    togglePinProject,
    updateDefaultApp,
    workspaceApps,
    workspaces,
  } = useWorkspace();
  const [filter, setFilter] = useState<ProjectFilter>("all");

  const { hasVisibleProjects, pinnedList, projectsByWorkspace, recentList } = useMemo(
    () =>
      organizeProjects({
        pinnedPaths: pinnedProjects,
        projects,
        recentProjects,
        recentProjectsCount,
        showRecentProjects,
        workspaces,
      }),
    [pinnedProjects, projects, recentProjects, recentProjectsCount, showRecentProjects, workspaces],
  );

  const pinnedSet = useMemo(() => new Set(pinnedProjects), [pinnedProjects]);

  const filtered = useMemo(() => {
    const keep = (project: Project) => matchesProjectFilter(project, filter, pinnedSet, projectTags);
    return {
      pinnedList: pinnedList.filter(keep),
      projectsByWorkspace: Object.fromEntries(
        Object.entries(projectsByWorkspace).map(([folder, items]) => [folder, items.filter(keep)]),
      ) as Record<string, Project[]>,
      recentList: recentList.filter(keep),
    };
  }, [filter, pinnedList, pinnedSet, projectTags, projectsByWorkspace, recentList]);

  const filteredCount =
    filtered.pinnedList.length +
    filtered.recentList.length +
    Object.values(filtered.projectsByWorkspace).reduce((sum, items) => sum + items.length, 0);

  if (onboardingHydrated && !onboardingCompleted) {
    return (
      <Onboarding
        defaultApp={defaultApp}
        loadData={loadData}
        onComplete={() => setOnboardingCompleted(true)}
        onImportSettings={importSettings}
        onSelectDefaultApp={async (app) => {
          await updateDefaultApp(toApp(app));
        }}
        workspaces={workspaces}
      />
    );
  }

  const listActions = <RefreshAndSettingsActions loadData={loadData} />;

  const renderProjects = (items: Project[], isPinnedSection: boolean) =>
    items.map((project, index) => (
      <ProjectItem
        canMovePinDown={isPinnedSection && index < items.length - 1}
        canMovePinUp={isPinnedSection && index > 0}
        defaultApp={defaultApp}
        isPinned={isPinnedSection || pinnedSet.has(project.fullPath)}
        key={listItemId(project.fullPath)}
        onOpen={recordProjectOpen}
        onRefresh={loadData}
        onRefreshGit={refreshProjectGit}
        onReorderPin={reorderPinnedProject}
        onTogglePin={togglePinProject}
        project={project}
        showGitStatus={showGitStatus}
        showStashCount={showStashCount}
        terminalApp={terminalApp}
        workspaceApps={workspaceApps}
        workspacePath={project.parentFolder}
      />
    ));

  return (
    <List
      isLoading={isLoading}
      searchBarAccessory={
        <List.Dropdown onChange={(value) => setFilter(value as ProjectFilter)} tooltip="Filter" value={filter}>
          <List.Dropdown.Item icon={Icon.BulletPoints} title="All Projects" value="all" />
          <List.Dropdown.Item icon={Icon.Pin} title="Pinned" value="pinned" />
          {tags.length > 0 ? (
            <List.Dropdown.Section title="Tags">
              {tags.map((tag) => (
                <List.Dropdown.Item key={tag.id} icon={Icon.Tag} title={tag.name} value={`tag:${tag.id}`} />
              ))}
            </List.Dropdown.Section>
          ) : null}
          {workspaces.length > 0 ? (
            <List.Dropdown.Section title="Workspaces">
              {workspaces.map((folder) => (
                <List.Dropdown.Item
                  key={folder}
                  icon={Icon.Folder}
                  title={path.basename(folder)}
                  value={`ws:${folder}`}
                />
              ))}
            </List.Dropdown.Section>
          ) : null}
          <List.Dropdown.Section title="Git">
            <List.Dropdown.Item icon={Icon.Exclamationmark} title="Dirty" value="dirty" />
            <List.Dropdown.Item icon={Icon.CheckCircle} title="Clean" value="clean" />
          </List.Dropdown.Section>
        </List.Dropdown>
      }
      searchBarPlaceholder="Search projects…"
    >
      {filtered.pinnedList.length > 0 && (
        <List.Section title="Pinned">{renderProjects(filtered.pinnedList, true)}</List.Section>
      )}
      {filtered.recentList.length > 0 && (
        <List.Section title="Recent">{renderProjects(filtered.recentList, false)}</List.Section>
      )}

      {workspaces.map((folder) => {
        const workspaceProjects = filtered.projectsByWorkspace[folder] ?? [];
        if (workspaceProjects.length === 0) return null;

        return (
          <List.Section
            key={folder}
            subtitle={`${folder} • ${workspaceProjects.length} project${workspaceProjects.length === 1 ? "" : "s"}`}
            title={path.basename(folder)}
          >
            {renderProjects(workspaceProjects, false)}
          </List.Section>
        );
      })}

      {workspaces.length === 0 && !isLoading && (
        <List.EmptyView
          actions={listActions}
          description="Add a workspace in Settings to see your projects."
          title="No Workspaces"
        />
      )}
      {workspaces.length > 0 && !isLoading && !hasVisibleProjects && (
        <List.EmptyView
          actions={listActions}
          description="No folders found inside your workspaces. Add or manage workspaces in Settings."
          title="No Projects Found"
        />
      )}
      {workspaces.length > 0 && hasVisibleProjects && filter !== "all" && filteredCount === 0 && (
        <List.EmptyView
          actions={listActions}
          description="Try another filter, or clear the filter to see all projects."
          title="No Projects Match Filter"
        />
      )}
      {workspaces.length > 0 && hasVisibleProjects && (
        <List.EmptyView actions={listActions} description="Try a different search." title="No Matching Projects" />
      )}
    </List>
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
        <Action.Push
          icon={Icon.Cog}
          shortcut={{ key: ",", modifiers: ["cmd", "shift"] }}
          target={<Settings onWorkspacesChanged={loadData} />}
          title="Open Settings…"
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
