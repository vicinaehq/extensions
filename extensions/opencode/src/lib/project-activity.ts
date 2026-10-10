import type { SessionInfo } from "./opencode/types";

export interface ProjectActivity {
  readonly last: number;
  readonly count: number;
}

/** Most recent top-level session activity and session count per project ID. */
export function activityByProject(sessions: readonly SessionInfo[]): Map<string, ProjectActivity> {
  const byProject = new Map<string, ProjectActivity>();
  for (const session of sessions) {
    if (session.parentID) continue;
    const existing = byProject.get(session.projectID);
    byProject.set(session.projectID, {
      last: Math.max(existing?.last ?? 0, session.time.updated),
      count: (existing?.count ?? 0) + 1,
    });
  }
  return byProject;
}
