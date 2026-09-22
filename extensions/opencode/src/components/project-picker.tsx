import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createOpenCodeService } from "../lib/opencode/client";
import type { Endpoint } from "../lib/opencode/discovery";
import { mapOpenCodeError, type OpenCodeError } from "../lib/opencode/errors";
import type { Project, SessionInfo } from "../lib/opencode/types";
import { activityByProject } from "../lib/project-activity";
import { relativeTime } from "../lib/time";

const GLOBAL_DIRECTORY = "/";

export function basename(directory: string): string {
  const parts = directory.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? directory;
}

/**
 * Project picker backed by the official project API, sorted by recent
 * activity. Used as the first step of the Review and New Session flows,
 * and as the project scope picker inside Ask.
 */
export function ProjectPickerList(props: {
  readonly endpoint: Endpoint;
  readonly onPick: (project: Project) => void;
  readonly navigationTitle: string;
}): ReactNode {
  const [projects, setProjects] = useState<Project[] | undefined>(undefined);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<OpenCodeError | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const service = createOpenCodeService(props.endpoint);
    void (async () => {
      try {
        const [projectList, page] = await Promise.all([
          service.projects(),
          service.sessions({ limit: 100 }).catch(() => null),
        ]);
        if (controller.signal.aborted) return;
        setProjects(projectList);
        if (page) setSessions(page.data);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(mapOpenCodeError(caught));
      }
    })();
    return () => controller.abort();
  }, [props.endpoint]);

  const activity = useMemo(() => activityByProject(sessions), [sessions]);
  const sorted = useMemo(() => {
    return (projects ?? [])
      .filter((project) => project.canonical !== GLOBAL_DIRECTORY)
      .sort((a, b) => (activity.get(b.id)?.last ?? 0) - (activity.get(a.id)?.last ?? 0));
  }, [projects, activity]);

  if (error) {
    return (
      <List navigationTitle={props.navigationTitle}>
        <List.EmptyView title={error.message} description="Projects could not be loaded." />
      </List>
    );
  }

  return (
    <List
      isLoading={projects === undefined}
      filtering
      searchBarPlaceholder="Search projects"
      navigationTitle={props.navigationTitle}
    >
      {sorted.map((project) => (
        <List.Item
          key={project.id}
          id={project.id}
          title={basename(project.canonical)}
          subtitle={project.canonical}
          icon={Icon.Folder}
          keywords={[project.canonical]}
          accessories={[{ text: relativeTime(activity.get(project.id)?.last) }]}
          actions={
            <ActionPanel>
              <Action title="Use This Project" icon="folder" onAction={() => props.onPick(project)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
