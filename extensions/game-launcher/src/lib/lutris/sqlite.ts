/**
 * Read-only access to Lutris's SQLite database through Node's built-in
 * `node:sqlite` (unflagged from Node 22.13; the read-only and busy-timeout
 * options need 22.12 and 22.16), so no native dependency has to be bundled.
 *
 * The module is loaded with process.getBuiltinModule (no import for the
 * bundler to resolve), and its one-time "SQLite is an experimental feature"
 * warning is swallowed so it doesn't clutter Vicinae's logs.
 */
import type { DatabaseSync } from "node:sqlite";

type SqliteModule = typeof import("node:sqlite");

let cached: SqliteModule | null | undefined;

export function loadSqlite(): SqliteModule | undefined {
  if (cached !== undefined) return cached ?? undefined;
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const message = typeof warning === "string" ? warning : warning?.message;
    if (/SQLite is an experimental feature/.test(message ?? "")) return;
    return (original as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    cached = (process.getBuiltinModule?.("node:sqlite") as SqliteModule | undefined) ?? null;
  } catch {
    cached = null;
  } finally {
    process.emitWarning = original;
  }
  return cached ?? undefined;
}

/** Open a database read-only, waiting briefly if Lutris is mid-write. */
export function openReadOnly(path: string): DatabaseSync {
  const sqlite = loadSqlite();
  if (!sqlite) throw new Error(`Reading Lutris games needs Node 22.13 or newer (running ${process.version})`);
  return new sqlite.DatabaseSync(path, { readOnly: true, timeout: 1000 });
}
