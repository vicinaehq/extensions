import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runInTerminal } from "@vicinae/api";
import { OpenCodeError } from "./opencode/errors";

const execFileAsync = promisify(execFile);

/** Matches OpenCode V2 version output such as `opencode v2.0.8` or `2.0.8`. */
const V2_VERSION_PATTERN = /(^|\s)v?2\.\d+/;

async function isV2Binary(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(name, ["--version"], { timeout: 5_000 });
    return V2_VERSION_PATTERN.test(stdout.trim());
  } catch {
    return false;
  }
}

/**
 * Resolve the OpenCode V2 executable used to open the TUI.
 *
 * An explicitly configured path wins; otherwise `opencode2` then `opencode`
 * are probed on PATH and verified to be a V2 build.
 */
export async function resolveOpenCodeBinary(configured?: string): Promise<string> {
  for (const candidate of configured ? [configured] : ["opencode2", "opencode"]) {
    if (await isV2Binary(candidate)) return candidate;
  }
  if (configured) {
    throw new OpenCodeError(
      "not-installed",
      "The configured OpenCode executable is not OpenCode V2.",
      `openCodePath: ${configured}`,
    );
  }
  throw new OpenCodeError("not-installed", "OpenCode V2 executable not found.");
}

/** Open the OpenCode TUI resumed at a specific session. */
export async function openSessionInTUI(binary: string, sessionID: string, directory?: string): Promise<void> {
  const args = directory ? [binary, "--session", sessionID, directory] : [binary, "--session", sessionID];
  await runInTerminal(args, { hold: true });
}

/** Open the OpenCode TUI in an optional directory. */
export async function openTUI(binary: string, directory?: string): Promise<void> {
  await runInTerminal(directory ? [binary, directory] : [binary], { hold: true });
}

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Copyable shell command that resumes a session in the TUI. Every argument is
 * quoted, since directory and session ID come from server responses.
 */
export function buildResumeCommand(sessionID: string, directory: string | undefined, configured?: string): string {
  const binary = posixQuote(configured || "opencode");
  const cd = directory ? `cd -- ${posixQuote(directory)} && ` : "";
  return `${cd}${binary} --session ${posixQuote(sessionID)}`;
}

/** Open a terminal window whose working directory is `directory`. */
export async function openTerminalAt(directory: string): Promise<void> {
  const command = `cd -- ${posixQuote(directory)} && exec "$SHELL"`;
  await runInTerminal(["sh", "-c", command], { hold: true });
}
