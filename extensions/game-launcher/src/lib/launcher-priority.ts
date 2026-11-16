/**
 * The user's launcher priority: which launcher opens a game that's installed
 * in several. Stored as a small JSON file (not Vicinae's async LocalStorage)
 * so the synchronous library scan can read it.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type GameSource, LAUNCHER_PRECEDENCE } from "./games";

/** Known launchers in the given order, without repeats, with any missing ones appended in default order. */
export function normalizePriority(order: unknown): GameSource[] {
  const known = new Set<string>(LAUNCHER_PRECEDENCE);
  const seen = new Set<GameSource>();
  for (const item of Array.isArray(order) ? order : []) {
    if (typeof item === "string" && known.has(item) && !seen.has(item as GameSource)) seen.add(item as GameSource);
  }
  for (const l of LAUNCHER_PRECEDENCE) seen.add(l);
  return [...seen];
}

export function loadPriority(path: string): GameSource[] {
  try {
    return normalizePriority((JSON.parse(readFileSync(path, "utf8")) as { order?: unknown }).order);
  } catch {
    return [...LAUNCHER_PRECEDENCE];
  }
}

export function savePriority(path: string, order: readonly GameSource[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ order: normalizePriority(order) }));
  renameSync(tmp, path);
}

/** Move a launcher up (delta -1) or down (+1); out-of-range moves leave the order unchanged. */
export function moveLauncher(order: readonly GameSource[], launcher: GameSource, delta: -1 | 1): GameSource[] {
  const from = order.indexOf(launcher);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function isDefaultPriority(order: readonly GameSource[]): boolean {
  return order.length === LAUNCHER_PRECEDENCE.length && order.every((l, i) => l === LAUNCHER_PRECEDENCE[i]);
}
