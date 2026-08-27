/**
 * Credential Resolver with multi-fallback chains
 * Inspired by CodexBar's provider architecture
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const execFileAsync = promisify(execFile);

export interface CredentialSource {
  type: "api_key" | "file" | "keychain" | "env_var" | "browser_cookie" | "oauth";
  value: string;
  metadata?: Record<string, string>;
}

export interface CredentialResolverOptions {
  /** Priority-ordered list of source types to try */
  sources: CredentialSource[];
  /** Timeout for each source in milliseconds */
  timeoutMs?: number;
  /** Whether to cache successful resolutions */
  cacheResults?: boolean;
}

export interface ResolvedCredential {
  source: CredentialSource;
  value: string;
  metadata?: Record<string, string>;
}

/**
 * Resolve credentials with fallback chain
 * Tries each source in order until one succeeds
 */
export async function resolveCredential(
  options: CredentialResolverOptions,
): Promise<ResolvedCredential | null> {
  const { sources, timeoutMs = 5000 } = options;

  for (const source of sources) {
    try {
      const value = await resolveSource(source, timeoutMs);
      if (value) {
        return { source, value, metadata: source.metadata };
      }
    } catch {
      // Continue to next source
    }
  }

  return null;
}

async function resolveSource(
  source: CredentialSource,
  timeoutMs: number,
): Promise<string | null> {
  switch (source.type) {
    case "api_key":
      return source.value || null;

    case "env_var":
      return resolveEnvVar(source.value, timeoutMs);

    case "file":
      return resolveFile(source.value);

    case "keychain":
      return resolveKeychain(source.value, timeoutMs);

    case "browser_cookie":
      return resolveBrowserCookie(source.value, timeoutMs);

    case "oauth":
      // OAuth requires special handling per provider
      return source.value || null;

    default:
      return null;
  }
}

/**
 * Resolve environment variable with shell fallback
 * Raycast/Vicinae don't inherit shell env, so we spawn a login shell
 */
async function resolveEnvVar(
  varName: string,
  timeoutMs: number,
): Promise<string | null> {
  // Try direct process.env first
  const direct = process.env[varName]?.trim();
  if (direct) return direct;

  // Spawn login shell to resolve
  try {
    const shell = process.env.SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/zsh");
    const isWindows = process.platform === "win32";

    const lookupScript = isWindows
      ? `echo %${varName}%`
      : `printf '%s' "$${varName}"`;

    const shellArgs = isWindows
      ? ["/d", "/s", "/c", lookupScript]
      : ["-ilc", lookupScript];

    const { stdout } = await execFileAsync(shell, shellArgs, {
      encoding: "utf-8",
      timeout: timeoutMs,
      maxBuffer: 64 * 1024,
    });

    const value = stdout.trim();
    // Filter out unexpanded variables (Windows %VAR% or empty)
    if (!value || value === `%${varName}%` || value === `$${varName}`) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

/**
 * Resolve credential from file path
 */
function resolveFile(filePath: string): string | null {
  try {
    const expanded = filePath.replace(/^~/, os.homedir());
    if (!fs.existsSync(expanded)) return null;

    const content = fs.readFileSync(expanded, "utf-8").trim();
    return content || null;
  } catch {
    return null;
  }
}

/**
 * Resolve credential from platform keychain/credential store
 */
async function resolveKeychain(
  service: string,
  timeoutMs: number,
): Promise<string | null> {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      // macOS Keychain
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s", service,
        "-w",
      ], { encoding: "utf-8", timeout: timeoutMs });
      return stdout.trim() || null;
    }

    if (platform === "win32") {
      // Windows Credential Manager
      const { stdout } = await execFileAsync("cmdkey", [
        `/generic:${service}`,
        "/retrieve",
      ], { encoding: "utf-8", timeout: timeoutMs });

      const match = stdout.match(/Password:\s*(.*)/);
      return match ? match[1].trim() : null;
    }

    if (platform === "linux") {
      // Linux Secret Service (gnome-keyring/kwallet)
      const { stdout } = await execFileAsync("secret-tool", [
        "lookup",
        "service", service,
      ], { encoding: "utf-8", timeout: timeoutMs });
      return stdout.trim() || null;
    }
  } catch {
    // Keychain unavailable or entry not found
  }

  return null;
}

/**
 * Resolve credential from browser cookies
 * Supports Chrome, Firefox, Safari
 */
async function resolveBrowserCookie(
  domain: string,
  timeoutMs: number,
): Promise<string | null> {
  const platform = process.platform;
  const homeDir = os.homedir();

  // Browser cookie paths by platform
  const cookiePaths: Record<string, string[]> = {
    darwin: [
      // Chrome
      path.join(homeDir, "Library/Application Support/Google/Chrome/Default/Cookies"),
      // Firefox
      path.join(homeDir, "Library/Application Support/Firefox/Profiles"),
      // Safari
      path.join(homeDir, "Library/Cookies/Cookies.binarycookies"),
    ],
    win32: [
      // Chrome
      path.join(homeDir, "AppData/Local/Google/Chrome/User Data/Default/Cookies"),
      // Firefox
      path.join(homeDir, "AppData/Roaming/Mozilla/Firefox/Profiles"),
    ],
    linux: [
      // Chrome
      path.join(homeDir, ".config/google-chrome/Default/Cookies"),
      // Firefox
      path.join(homeDir, ".mozilla/firefox"),
    ],
  };

  const paths = cookiePaths[platform] || [];

  for (const cookiePath of paths) {
    try {
      // Check if cookie store exists
      if (!fs.existsSync(cookiePath)) continue;

      // For now, return a placeholder
      // Full implementation would parse SQLite/JSON cookie stores
      console.log(`Cookie store found at: ${cookiePath} for domain: ${domain}`);
    } catch {
      // Continue to next browser
    }
  }

  return null;
}

/**
 * Helper to create a credential source from environment variable
 */
export function envSource(varName: string): CredentialSource {
  return { type: "env_var", value: varName };
}

/**
 * Helper to create a credential source from file
 */
export function fileSource(filePath: string): CredentialSource {
  return { type: "file", value: filePath };
}

/**
 * Helper to create a credential source from keychain
 */
export function keychainSource(service: string): CredentialSource {
  return { type: "keychain", value: service };
}

/**
 * Helper to create a credential source from API key preference
 */
export function apiKeySource(apiKey: string): CredentialSource {
  return { type: "api_key", value: apiKey };
}
