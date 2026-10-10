import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Config } from "./lib/config";
import { createOpenCodeService } from "./lib/opencode/client";
import { mapOpenCodeError, type OpenCodeError } from "./lib/opencode/errors";
import type { Endpoint } from "./lib/opencode/discovery";
import type { Project, SessionActive, SessionInfo } from "./lib/opencode/types";
import { activityByProject } from "./lib/project-activity";
import { relativeTime } from "./lib/time";
import { OpenDirectoryAction, OpenTerminalAction } from "./components/actions";
import { basename } from "./components/project-picker";
import { useOpenCodeCommand } from "./components/command-gate";
import { NewSessionFlow } from "./new-session";
import { SessionListView } from "./components/session-list";
import { OpenCodeErrorView } from "./components/error-state";

const GLOBAL_DIRECTORY = "/";

/**
 * Project browser backed by the official project API. Projects are sorted by
 * their most recent session activity; the global pseudo-project is hidden.
 */
export function ProjectListView(props: {
  readonly endpoint: Endpoint;
  readonly config: Config;
  readonly navigationTitle: string;
}): ReactNode {
  const { push } = useNavigation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [active, setActive] = useState<Record<string, SessionActive>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<OpenCodeError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      try {
        const [projectList, page, activeMap] = await Promise.all([
          service.projects(),
          service.sessions({ limit: 100 }).catch(() => null),
          service.activeSessions().catch(() => ({})),
        ]);
        if (signal?.aborted) return;
        setProjects(projectList);
        if (page) setSessions(page.data);
        setActive(activeMap);
        setError(null);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(mapOpenCodeError(caught));
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [service],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  const visibleProjects = useMemo(() => {
    const activity = activityByProject(sessions);
    return projects
      .filter((project) => project.canonical !== GLOBAL_DIRECTORY)
      .map((project) => ({
        project,
        lastActivity: activity.get(project.id)?.last,
        sessionCount: activity.get(project.id)?.count ?? 0,
      }))
      .sort((a, b) => (b.lastActivity ?? b.project.time?.updated ?? 0) - (a.lastActivity ?? a.project.time?.updated ?? 0));
  }, [projects, sessions]);

  if (error) {
    return <OpenCodeErrorView error={error} config={props.config} onRetry={() => setReloadKey((v) => v + 1)} />;
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      filtering
      searchBarPlaceholder="Search projects"
      navigationTitle={props.navigationTitle}
    >
      {visibleProjects.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Folder}
          title="No projects yet"
          description="Open a repository with OpenCode and it will show up here."
          actions={
            <ActionPanel>
              <Action
                title="New Session"
                onAction={() => push(<NewSessionFlow endpoint={props.endpoint} config={props.config} />)}
              />
            </ActionPanel>
          }
        />
      ) : (
        visibleProjects.map(({ project, lastActivity, sessionCount }) => {
          const working = sessions.some(
            (session) => session.projectID === project.id && !session.parentID && active[session.id],
          );
          return (
            <List.Item
              key={project.id}
              id={project.id}
              title={basename(project.canonical)}
              subtitle={project.canonical}
              icon={Icon.Folder}
              keywords={[project.canonical, project.vcs ?? ""]}
              accessories={[
                ...(project.vcs ? [{ tag: { value: project.vcs, color: "#6e79f0" } } satisfies List.Item.Accessory] : []),
                ...(working ? [{ tag: { value: "Working", color: "#f5a623" } } satisfies List.Item.Accessory] : []),
                { text: sessionCount > 0 ? `${sessionCount} session${sessionCount === 1 ? "" : "s"}` : "" },
                { text: relativeTime(lastActivity ?? project.time?.updated) },
              ]}
              detail={
                <List.Item.Detail
                  markdown={`**${basename(project.canonical)}**\n\n- Directory: \`${project.canonical}\`\n- VCS: ${project.vcs ?? "none"}\n- Sessions: ${sessionCount}\n- Last activity: ${relativeTime(lastActivity ?? project.time?.updated) ?? "unknown"}`}
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title="New Session"
                    icon="new-folder"
                    shortcut="new"
                    onAction={() =>
                      push(
                        <NewSessionFlow
                          endpoint={props.endpoint}
                          config={props.config}
                          initialProject={project}
                        />,
                      )
                    }
                  />
                  <Action
                    title="View Sessions"
                    icon="speech-bubble"
                    shortcut="open"
                    onAction={() =>
                      push(
                        <SessionListView
                          endpoint={props.endpoint}
                          config={props.config}
                          projectID={project.id}
                          navigationTitle={`Sessions · ${basename(project.canonical)}`}
                        />,
                      )
                    }
                  />
                  <OpenDirectoryAction directory={project.canonical} />
                  <OpenTerminalAction directory={project.canonical} />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}

export default function ProjectsCommand(): ReactNode {
  const command = useOpenCodeCommand();
  if (!command.ready) return command.view;
  return (
    <ProjectListView endpoint={command.endpoint} config={command.config} navigationTitle="OpenCode Projects" />
  );
}
