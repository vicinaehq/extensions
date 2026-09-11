import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { DatabaseSync } from "node:sqlite";

import { decodeJwtPayload } from "../agents/jwt.ts";

// Cross-platform Cursor state database paths
function getCursorStateDbPaths(): string[] {
  const homeDir = os.homedir();
  const platform = process.platform;

  if (platform === "darwin") {
    return [
      path.join(homeDir, "Library/Application Support/Cursor/User/globalStorage/state.vscdb"),
    ];
  }

  if (platform === "win32") {
    return [
      path.join(homeDir, "AppData/Roaming/Cursor/User/globalStorage/state.vscdb"),
      path.join(homeDir, "AppData/Local/Cursor/User/globalStorage/state.vscdb"),
    ];
  }

  // Linux
  return [
    path.join(homeDir, ".config/Cursor/User/globalStorage/state.vscdb"),
    path.join(homeDir, ".cursor/User/globalStorage/state.vscdb"),
  ];
}

interface CursorAccessTokenPayload {
  sub?: string;
  exp?: number;
}

export interface CursorAppAuthSession {
  cookieHeader: string;
  userId: string;
  source: "cursor-app";
}

interface ResolveCursorAppAuthOptions {
  dbPath?: string;
  now?: number;
}

function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getCursorUserIdFromPayload(payload: CursorAccessTokenPayload | null): string | null {
  const subject = payload?.sub;
  const userId = subject?.split("|").filter(Boolean).at(-1)?.trim();
  if (!userId) {
    return null;
  }

  return /^[A-Za-z0-9._-]+$/.test(userId) ? userId : null;
}

function resolveAccessToken(accessToken: string, now: number): { userId: string; cookieHeader: string } | null {
  const payload = decodeJwtPayload<CursorAccessTokenPayload>(accessToken);
  if (!payload || typeof payload.exp !== "number" || payload.exp * 1000 - now <= 60_000) {
    return null;
  }

  const userId = getCursorUserIdFromPayload(payload);
  return userId ? { userId, cookieHeader: `WorkosCursorSessionToken=${userId}%3A%3A${accessToken}` } : null;
}

export function resolveCursorStateDbPath(env: NodeJS.ProcessEnv = process.env): string | null {
  // Check environment override first
  const envPath = trimToNull(env.TEST_CURSOR_STATE_DB_PATH) ?? trimToNull(env.CURSOR_STATE_DB_PATH);
  if (envPath) return envPath;

  // Try platform-specific paths
  for (const dbPath of getCursorStateDbPaths()) {
    if (fs.existsSync(dbPath)) {
      return dbPath;
    }
  }

  return null;
}

export function getCursorUserIdFromAccessToken(accessToken: string): string | null {
  return getCursorUserIdFromPayload(decodeJwtPayload<CursorAccessTokenPayload>(accessToken));
}

export function isCursorAccessTokenUsable(accessToken: string, now = Date.now()): boolean {
  return resolveAccessToken(accessToken, now) !== null;
}

export function buildCursorCookieHeader(accessToken: string): string | null {
  const userId = getCursorUserIdFromAccessToken(accessToken);
  return userId ? `WorkosCursorSessionToken=${userId}%3A%3A${accessToken}` : null;
}

const CURSOR_TOKEN_QUERY = "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1";

/**
 * Reads the token through node:sqlite against a temp-file snapshot
 * (db + wal + shm) so the live Cursor state DB is never locked — same
 * approach as src/omp/store.ts. Returns null when the host Node lacks
 * node:sqlite or anything goes wrong; callers fall back to the CLI.
 */
async function readTokenViaNodeSqlite(dbPath: string): Promise<string | null> {
  let snapshotDir: string | null = null;
  try {
    const { default: nodeSqlite } = (await import("node:sqlite")) as unknown as {
      default: { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => DatabaseSync };
    };
    snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-state-"));
    let copied = false;
    for (const suffix of ["", "-wal", "-shm"] as const) {
      const source = `${dbPath}${suffix}`;
      try {
        if (!fs.statSync(source).isFile()) continue;
      } catch {
        continue;
      }
      fs.copyFileSync(source, path.join(snapshotDir, `${path.basename(dbPath)}${suffix}`));
      copied = true;
    }
    if (!copied) return null;
    const db = new nodeSqlite.DatabaseSync(path.join(snapshotDir, path.basename(dbPath)), { readOnly: true });
    try {
      const row = db.prepare(CURSOR_TOKEN_QUERY).get() as { value?: unknown } | undefined;
      return trimToNull(typeof row?.value === "string" ? row.value : undefined);
    } finally {
      try {
        db.close();
      } catch {
        // Ignore close failures.
      }
    }
  } catch {
    return null;
  } finally {
    if (snapshotDir) {
      try {
        fs.rmSync(snapshotDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures.
      }
    }
  }
}

/** Fallback for hosts without node:sqlite (e.g. older embedded Node runtimes). */
function readTokenViaCli(dbPath: string): string | null {
  try {
    const sqliteCmd = process.platform === "win32" ? "sqlite3.exe" : "sqlite3";
    const output = execFileSync(sqliteCmd, ["-readonly", dbPath, `${CURSOR_TOKEN_QUERY};`], {
      encoding: "utf-8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return trimToNull(output);
  } catch {
    return null;
  }
}

export async function readCursorAppAccessToken(dbPath?: string): Promise<string | null> {
  const resolvedPath = dbPath ?? resolveCursorStateDbPath();
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return null;
  }
  return (await readTokenViaNodeSqlite(resolvedPath)) ?? readTokenViaCli(resolvedPath);
}

export async function resolveCursorAppAuthSession(
  options: ResolveCursorAppAuthOptions = {},
): Promise<CursorAppAuthSession | null> {
  const accessToken = await readCursorAppAccessToken(options.dbPath);
  if (!accessToken) {
    return null;
  }

  const session = resolveAccessToken(accessToken, options.now ?? Date.now());
  return session ? { ...session, source: "cursor-app" } : null;
}
