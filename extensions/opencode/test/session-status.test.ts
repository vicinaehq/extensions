import { describe, expect, test } from "bun:test";
import { sessionStatus, statusLabel } from "../src/lib/session-status";
import { sessionFixture } from "./helpers";
import type { SessionInfo } from "../src/lib/opencode/types";

function asSession(overrides: Record<string, unknown> = {}): SessionInfo {
  return sessionFixture(overrides) as unknown as SessionInfo;
}

describe("session status", () => {
  test("running sessions are Working", () => {
    const session = asSession();
    const status = sessionStatus(session, { active: { [session.id]: { type: "running" } }, waiting: new Set() });
    expect(status).toBe("working");
    expect(statusLabel(status)).toBe("Working");
  });

  test("sessions with pending permission requests are Waiting", () => {
    const session = asSession();
    const status = sessionStatus(session, { active: {}, waiting: new Set([session.id]) });
    expect(status).toBe("waiting");
    expect(statusLabel(status)).toBe("Waiting for Input");
  });

  test("failed outcomes are Failed", () => {
    const session = asSession({ outcome: "failed" });
    const status = sessionStatus(session, { active: {}, waiting: new Set() });
    expect(status).toBe("failed");
    expect(statusLabel(status)).toBe("Failed");
  });

  test("everything else is Idle", () => {
    const session = asSession({ outcome: "succeeded" });
    const status = sessionStatus(session, { active: {}, waiting: new Set() });
    expect(status).toBe("idle");
    expect(statusLabel(status)).toBe("Idle");
  });

  test("waiting wins over working and failure", () => {
    const session = asSession({ outcome: "failed" });
    const status = sessionStatus(session, {
      active: { [session.id]: { type: "running" } },
      waiting: new Set([session.id]),
    });
    expect(status).toBe("waiting");
  });
});
