import type { AgentId } from "./types.ts";

export const DEFAULT_AGENT_ORDER = [
  "aihubmix",
  "amp",
  "antigravity",
  "claude",
  "clinepass",
  "codex",
  "commandcode",
  "copilot",
  "cursor",
  "deepseek",
  "devin",
  "droid",
  "gemini",
  "grok",
  "kimi",
  "minimax",
  "minimaxcn",
  "opencode-go",
  "synthetic",
  "zai",
] as const satisfies readonly AgentId[];

const defaultOrderIndex = new Map<AgentId, number>(DEFAULT_AGENT_ORDER.map((agentId, index) => [agentId, index]));

/** Providers that can be pinned — every provider wired into the registry. */
const PINNABLE_AGENT_IDS: ReadonlySet<AgentId> = new Set(DEFAULT_AGENT_ORDER);

const MAX_PINNED_PROVIDERS = 3;

/**
 * Parses the `pinnedProviders` preference (comma-separated provider ids).
 * Unknown ids are dropped and at most MAX_PINNED_PROVIDERS are kept.
 */
export function parsePinnedProviders(pinned?: string): AgentId[] {
  if (!pinned) return [];
  return pinned
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((id): id is AgentId => PINNABLE_AGENT_IDS.has(id as AgentId))
    .slice(0, MAX_PINNED_PROVIDERS);
}

export function sortByDefaultAgentOrder<T extends { id: AgentId }>(agents: readonly T[]): T[] {
  return agents
    .map((agent, originalIndex) => ({ agent, originalIndex }))
    .sort(
      (left, right) =>
        (defaultOrderIndex.get(left.agent.id) ?? Number.MAX_SAFE_INTEGER) -
          (defaultOrderIndex.get(right.agent.id) ?? Number.MAX_SAFE_INTEGER) ||
        left.originalIndex - right.originalIndex,
    )
    .map(({ agent }) => agent);
}

export function getInitialSelectedRowId(
  rows: ReadonlyArray<{ agentId: AgentId; rowId: string }>,
  savedAgentOrder?: readonly AgentId[],
): string | undefined {
  if (savedAgentOrder) {
    for (const agentId of savedAgentOrder) {
      const preferredRow = rows.find((row) => row.agentId === agentId);
      if (preferredRow) return preferredRow.rowId;
    }
  }

  return rows[0]?.rowId;
}
