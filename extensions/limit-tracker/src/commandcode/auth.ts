import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const SHELL_LOOKUP_TIMEOUT_MS = 3000;

function cleanToken(token: string | undefined): string | null {
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

/** Extract a key from one candidate object shape. */
function extractKeyFromRecord(record: Record<string, unknown>): string | null {
  for (const field of ["apiKey", "api_key", "token", "accessToken", "access_token"]) {
    const value = cleanToken(record[field] as string | undefined);
    if (value) return value;
  }
  return null;
}

/**
 * Read the Command Code API key from ~/.commandcode/auth.json.
 * Tolerant to shape drift: top-level key fields, { default: {...} } nesting,
 * { profiles: { <name>: {...} } } nesting. Never throws. Never logs the key.
 */
export function readCommandcodeAuthFile(homeDir: string = os.homedir()): string | null {
  try {
    const authPath = path.join(homeDir, ".commandcode", "auth.json");
    if (!fs.existsSync(authPath)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(authPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const root = parsed as Record<string, unknown>;

    const direct = extractKeyFromRecord(root);
    if (direct) return direct;

    const def = root.default;
    if (def && typeof def === "object" && !Array.isArray(def)) {
      const nested = extractKeyFromRecord(def as Record<string, unknown>);
      if (nested) return nested;
    }

    const profiles = root.profiles;
    if (profiles && typeof profiles === "object" && !Array.isArray(profiles)) {
      const entries = Object.values(profiles as Record<string, unknown>);
      for (const entry of entries) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const nested = extractKeyFromRecord(entry as Record<string, unknown>);
          if (nested) return nested;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function readShellEnvToken(): Promise<string | null> {
  try {
    const shell = process.env.SHELL || (process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "/bin/zsh");
    const shellName = shell.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? "";
    const isCommandShell = shellName === "cmd.exe" || shellName.endsWith(".cmd") || shellName.endsWith(".bat");
    // Vicinae does not inherit the login-shell environment, so resolve here.
    const lookupScript = isCommandShell ? "echo %COMMANDCODE_API_KEY%" : "printf '%s' \"$COMMANDCODE_API_KEY\"";
    const shellArgs = isCommandShell ? ["/d", "/s", "/c", lookupScript] : ["-ilc", lookupScript];
    const { stdout } = await execFileAsync(shell, shellArgs, {
      encoding: "utf-8",
      timeout: SHELL_LOOKUP_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
    });
    const value = stdout.trim();
    if (!value || value === "%COMMANDCODE_API_KEY%" || value === "$COMMANDCODE_API_KEY") return null;
    return value;
  } catch {
    return null;
  }
}

export async function resolveCommandcodeApiKey(preferenceToken?: string): Promise<string | null> {
  const preference = cleanToken(preferenceToken);
  if (preference) return preference;

  const direct = cleanToken(process.env.COMMANDCODE_API_KEY);
  if (direct) return direct;

  const fileKey = readCommandcodeAuthFile();
  if (fileKey) return fileKey;

  return readShellEnvToken();
}
