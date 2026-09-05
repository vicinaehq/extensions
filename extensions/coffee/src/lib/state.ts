import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { environment } from "@vicinae/api";
import { CoffeeStats, Schedule, Session, State } from "./types";

const EMPTY: State = { version: 3, session: null, schedules: [], stats: { totalCoffees: 0, startedAt: [] } };

function statePath(): string {
  const dir = environment.supportPath;
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

export function readState(): State {
  try {
    const raw = readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const version = typeof parsed.version === "number" ? parsed.version : null;
    if (version !== 1 && version !== 2 && version !== 3) return { ...EMPTY };
    const stats = normalizeStats(parsed.stats);
    return {
      version: 3,
      session: isSession(parsed.session) ? parsed.session : null,
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules.filter(isSchedule) : [],
      stats,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeState(state: State): void {
  const path = statePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

export function updateState(mutator: (state: State) => void): State {
  const state = readState();
  mutator(state);
  writeState(state);
  return state;
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const session = value as Session;
  return typeof session.pid === "number" && typeof session.mode === "string";
}

function isSchedule(value: unknown): value is Schedule {
  if (!value || typeof value !== "object") return false;
  const schedule = value as Schedule;
  return (
    typeof schedule.id === "string" &&
    Array.isArray(schedule.days) &&
    typeof schedule.from === "string" &&
    typeof schedule.to === "string"
  );
}

function isStats(value: unknown): value is CoffeeStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as CoffeeStats;
  return (
    typeof stats.totalCoffees === "number" &&
    Number.isFinite(stats.totalCoffees) &&
    stats.totalCoffees >= 0 &&
    Array.isArray(stats.startedAt) &&
    stats.startedAt.every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0)
  );
}

function normalizeStats(value: unknown): CoffeeStats {
  if (isStats(value)) return value;
  if (value && typeof value === "object") {
    const legacy = value as { totalCoffees?: unknown; startedAt?: unknown };
    const totalCoffees =
      typeof legacy.totalCoffees === "number" && Number.isFinite(legacy.totalCoffees) && legacy.totalCoffees >= 0
        ? legacy.totalCoffees
        : 0;
    const startedAt = Array.isArray(legacy.startedAt)
      ? legacy.startedAt.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry) && entry > 0)
      : [];
    return { totalCoffees, startedAt };
  }
  return { totalCoffees: 0, startedAt: [] };
}
