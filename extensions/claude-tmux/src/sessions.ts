import { readFile, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { ancestry, run } from "./proc";

export const CLAUDE_SESSION_RECORDS_DIR = join(homedir(), ".claude", "sessions");

export type ClaudeStatus = "busy" | "waiting" | "idle";

export type AgentKind = "Claude Code" | "Codex";

export type AgentSession = {
  agent: AgentKind;
  paneId: string;
  windowId: string;
  tmuxSession: string;
  windowIndex: number;
  windowName: string;
  paneIndex: number;
  windowPanes: number;
  pid: number;
  cwd: string;
  name?: string;
  status?: ClaudeStatus;
  waitingFor?: string;
  lastActivity: number;
};

type AgentEntry = {
  pid?: number;
  cwd: string;
  startedAt: number;
  name?: string;
  status?: ClaudeStatus;
  waitingFor?: string;
};

type Discovery<T> = {
  value: T;
  error?: string;
};

export type AgentSessionList = {
  sessions: AgentSession[];
  errors: string[];
};

type Pane = Pick<
  AgentSession,
  "paneId" | "windowId" | "tmuxSession" | "windowIndex" | "windowName" | "paneIndex" | "windowPanes"
>;

const PANE_FORMAT = [
  "#{pane_pid}",
  "#{pane_id}",
  "#{window_id}",
  "#{session_name}",
  "#{window_index}",
  "#{pane_index}",
  "#{window_panes}",
  "#{window_name}",
].join("\t");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingExecutable(error: unknown): boolean {
  return /ENOENT|not found/.test(errorMessage(error));
}

function isClaudeStatus(value: unknown): value is ClaudeStatus {
  return value === "busy" || value === "waiting" || value === "idle";
}

function isAgentEntry(value: unknown): value is AgentEntry {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.cwd === "string" &&
    typeof entry.startedAt === "number" &&
    (entry.pid === undefined || (typeof entry.pid === "number" && Number.isInteger(entry.pid))) &&
    (entry.name === undefined || typeof entry.name === "string") &&
    (entry.status === undefined || isClaudeStatus(entry.status)) &&
    (entry.waitingFor === undefined || typeof entry.waitingFor === "string")
  );
}

async function listAgents(): Promise<Discovery<AgentEntry[]>> {
  try {
    const parsed: unknown = JSON.parse(await run("claude", ["agents", "--json"]));
    if (!Array.isArray(parsed) || !parsed.every(isAgentEntry)) {
      throw new Error("Claude Code returned an invalid session list");
    }
    return { value: parsed };
  } catch (error) {
    if (isMissingExecutable(error)) {
      return { value: [] };
    }
    return { value: [], error: `Could not read Claude Code sessions: ${errorMessage(error)}` };
  }
}

async function listCodexPids(): Promise<Discovery<number[]>> {
  try {
    const uid = process.getuid?.();
    const args = uid === undefined ? ["-eo", "pid=,comm="] : ["-u", String(uid), "-o", "pid=,comm="];
    const output = await run("ps", args);
    return {
      value: output
      .split("\n")
      .map((line) => line.trim().split(/\s+/, 2))
      .filter((parts) => parts[1] === "codex")
      .map(([pid]) => Number(pid))
      .filter((pid) => Number.isInteger(pid) && pid > 1),
    };
  } catch (error) {
    return { value: [], error: `Could not inspect running Codex processes: ${errorMessage(error)}` };
  }
}

async function cwdOf(pid: number): Promise<string | undefined> {
  try {
    return await readlink(`/proc/${pid}/cwd`);
  } catch {
    return undefined;
  }
}

async function listPanesByPid(): Promise<Map<number, Pane>> {
  let output: string;
  try {
    output = await run("tmux", ["list-panes", "-a", "-F", PANE_FORMAT]);
  } catch (error) {
    if (error instanceof Error && /no server running|error connecting to/.test(error.message)) {
      return new Map();
    }
    throw error;
  }

  const panes = new Map<number, Pane>();
  for (const line of output.split("\n").filter(Boolean)) {
    const [panePid, paneId, windowId, tmuxSession, windowIndex, paneIndex, windowPanes, ...name] = line.split("\t");
    panes.set(Number(panePid), {
      paneId,
      windowId,
      tmuxSession,
      windowIndex: Number(windowIndex),
      paneIndex: Number(paneIndex),
      windowPanes: Number(windowPanes),
      windowName: name.join("\t"),
    });
  }
  return panes;
}

async function lastStatusChange(pid: number): Promise<number | undefined> {
  try {
    const record = JSON.parse(await readFile(join(CLAUDE_SESSION_RECORDS_DIR, `${pid}.json`), "utf8"));
    return typeof record.statusUpdatedAt === "number" ? record.statusUpdatedAt : undefined;
  } catch {
    return undefined;
  }
}

async function owningPane(pid: number, panes: Map<number, Pane>, claudePids: Set<number>): Promise<Pane | undefined> {
  for await (const ancestor of ancestry(pid)) {
    if (ancestor !== pid && claudePids.has(ancestor)) {
      return undefined;
    }
    const pane = panes.get(ancestor);
    if (pane) {
      return pane;
    }
  }
  return undefined;
}

export async function listAgentSessions(): Promise<AgentSessionList> {
  const [claude, panes, codex] = await Promise.all([listAgents(), listPanesByPid(), listCodexPids()]);
  const agents = claude.value;
  const codexPids = codex.value;
  const claudePids = new Set(agents.flatMap((agent) => (agent.pid === undefined ? [] : [agent.pid])));

  const claudeSessions = await Promise.all(
    agents.map(async (agent): Promise<AgentSession | undefined> => {
      if (agent.pid === undefined) {
        return undefined;
      }
      const pane = await owningPane(agent.pid, panes, claudePids);
      if (!pane) {
        return undefined;
      }
      return {
        ...pane,
        agent: "Claude Code",
        pid: agent.pid,
        cwd: agent.cwd,
        name: agent.name,
        status: agent.status,
        waitingFor: agent.waitingFor,
        lastActivity: (await lastStatusChange(agent.pid)) ?? agent.startedAt,
      };
    }),
  );

  const codexSessions = await Promise.all(
    codexPids.map(async (pid): Promise<AgentSession | undefined> => {
      const [pane, cwd] = await Promise.all([owningPane(pid, panes, new Set<number>()), cwdOf(pid)]);
      if (!pane || !cwd) {
        return undefined;
      }
      return {
        ...pane,
        agent: "Codex",
        pid,
        cwd,
        lastActivity: 0,
      };
    }),
  );

  const sessions = [...claudeSessions, ...codexSessions]
    .filter((session): session is AgentSession => session !== undefined)
    .sort((a, b) => b.lastActivity - a.lastActivity);
  return { sessions, errors: [claude.error, codex.error].filter((error): error is string => error !== undefined) };
}
