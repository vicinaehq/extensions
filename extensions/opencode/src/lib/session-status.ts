import type { SessionActive, SessionInfo } from "./opencode/types";

/** Lightweight session status derived from official OpenCode status data only. */
export type SessionStatusKind = "working" | "waiting" | "idle" | "failed";

export interface StatusInputs {
  /** Running sessions as reported by `GET /api/session/active`. */
  readonly active: Record<string, SessionActive>;
  /** Session IDs blocked on user input: pending permission requests or forms. */
  readonly waiting: ReadonlySet<string>;
}

/**
 * Resolve the display status of a session.
 * - Waiting: the session is blocked on user input (permission or question).
 * - Working: OpenCode reports the session as actively running.
 * - Failed: OpenCode reports a failed outcome for the latest run.
 * - Idle: everything else.
 */
export function sessionStatus(session: SessionInfo, inputs: StatusInputs): SessionStatusKind {
  if (inputs.waiting.has(session.id)) return "waiting";
  if (inputs.active[session.id]) return "working";
  if (session.outcome === "failed") return "failed";
  return "idle";
}

export function statusLabel(kind: SessionStatusKind): string {
  switch (kind) {
    case "working":
      return "Working";
    case "waiting":
      return "Waiting for Input";
    case "idle":
      return "Idle";
    case "failed":
      return "Failed";
  }
}
