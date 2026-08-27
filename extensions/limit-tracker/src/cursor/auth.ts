import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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

export function readCursorAppAccessToken(dbPath?: string): string | null {
  const resolvedPath = dbPath ?? resolveCursorStateDbPath();
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return null;
  }

  try {
    // Use sqlite3 command - works on all platforms
    const sqliteCmd = process.platform === "win32" ? "sqlite3.exe" : "sqlite3";
    const output = execFileSync(
      sqliteCmd,
      ["-readonly", resolvedPath, "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1;"],
      { encoding: "utf-8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"] },
    );
    return trimToNull(output);
  } catch {
    return null;
  }
}

export function resolveCursorAppAuthSession(options: ResolveCursorAppAuthOptions = {}): CursorAppAuthSession | null {
  const accessToken = readCursorAppAccessToken(options.dbPath);
  if (!accessToken) {
    return null;
  }

  const session = resolveAccessToken(accessToken, options.now ?? Date.now());
  return session ? { ...session, source: "cursor-app" } : null;
}

/**
 * Import Cursor cookies from browser (Chrome, Firefox, etc.)
 * This is a fallback when Cursor.app auth is not available
 */
export async function importCursorBrowserCookies(): Promise<string | null> {
  const platform = process.platform;
  const homeDir = os.homedir();

  // Browser cookie store paths
  const cookiePaths: string[] = [];

  if (platform === "darwin") {
    cookiePaths.push(
      path.join(homeDir, "Library/Application Support/Google/Chrome/Default/Cookies"),
      path.join(homeDir, "Library/Application Support/Google/Chrome/Profile 1/Cookies"),
      path.join(homeDir, "Library/Application Support/Chromium/Default/Cookies"),
    );
  } else if (platform === "win32") {
    cookiePaths.push(
      path.join(homeDir, "AppData/Local/Google/Chrome/User Data/Default/Cookies"),
      path.join(homeDir, "AppData/Local/Google/Chrome/Profile 1/Cookies"),
    );
  } else {
    cookiePaths.push(
      path.join(homeDir, ".config/google-chrome/Default/Cookies"),
      path.join(homeDir, ".config/chromium/Default/Cookies"),
    );
  }

  // For now, return null - full implementation would parse SQLite cookie stores
  // This is a placeholder for future implementation
  for (const cookiePath of cookiePaths) {
    if (fs.existsSync(cookiePath)) {
      console.log(`Cursor cookie store found at: ${cookiePath}`);
      // Future: Parse SQLite and extract cursor.com cookies
    }
  }

  return null;
}
