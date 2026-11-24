import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const sessionPath = /^\/net\/openvpn\/v3\/sessions\/[a-zA-Z0-9_]+$/;

export type Session = { path: string; profile?: string; status?: string };
export type Run = (args: string[]) => Promise<string>;

export async function runOpenVPN(args: string[]): Promise<string> {
  try {
    const child = exec("openvpn3", args, {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C" },
      timeout: args[0] === "session-start" ? 120_000 : 10_000,
    });
    // Never leave a CLI credential prompt waiting for input from the launcher.
    child.child.stdin?.end();
    return (await child).stdout.trimEnd();
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { killed?: boolean };
    if (failure.code === "ENOENT") {
      throw new Error("OpenVPN 3 was not found on Vicinae’s PATH.");
    }
    if (failure.killed) throw new Error(`OpenVPN 3 ${args[0]} timed out. Check Show Status.`);
    // CLI errors can contain authentication URLs. Keep them out of toasts.
    throw new Error(`OpenVPN 3 ${args[0]} failed. Check OpenVPN 3 in a terminal for details.`);
  }
}

export async function validateProfile(input: string): Promise<string> {
  const trimmed = input.trim();
  const path = normalize(trimmed.startsWith("~/") ? join(homedir(), trimmed.slice(2)) : trimmed);
  if (!isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path)) {
    throw new Error("Enter an absolute path or a path starting with ~/.");
  }
  try {
    if (!(await stat(path)).isFile()) throw new Error();
    await access(path, constants.R_OK);
  } catch {
    throw new Error("Choose a readable OpenVPN configuration file.");
  }
  return path;
}

export function parseSessions(output: string): Session[] {
  const sessions: Session[] = [];
  let current: Session | undefined;
  for (const line of output.split(/\r?\n/)) {
    const field = line.match(/^\s*(Path|Config name|Status): (.*)$/);
    if (!field) continue;
    const [, key, value] = field;
    if (key === "Path") {
      current = sessionPath.test(value.trim()) ? { path: value.trim() } : undefined;
      if (current) sessions.push(current);
    } else if (current && key === "Config name") {
      current.profile = value.replace(/  \((?:Config not available|Current name: .*?)\)$/, "");
    } else if (current && key === "Status") {
      current.status = value.trim();
    }
  }
  return sessions;
}

export function isConnected(session: Session): boolean {
  return /^Connection, Client connected(?:[:\s]|$)/i.test(session.status ?? "");
}

export async function listSessions(run: Run = runOpenVPN) {
  const output = await run(["sessions-list"]);
  const sessions = parseSessions(output);
  if (!sessions.length && !/^No sessions available\s*$/m.test(output)) {
    throw new Error("Unrecognized OpenVPN 3 session listing.");
  }
  return { output, sessions };
}

export async function connectProfile(
  profile: string,
  run: Run = runOpenVPN,
  wait: () => Promise<void> = () => sleep(2000),
  attempts = 60,
): Promise<"already-connected" | "already-active" | "connected" | "pending"> {
  const existing = (await listSessions(run)).sessions.filter((session) => session.profile === profile);
  if (existing.some(isConnected)) return "already-connected";
  if (existing.length) return "already-active";

  const output = await run(["session-start", "--config", profile]);
  const path = output.match(/^Session path: (\S+)\s*$/m)?.[1];
  if (!path || !sessionPath.test(path)) {
    throw new Error("OpenVPN 3 did not report a session path. Check Show Status.");
  }
  if (/Could not open the URL automatically|requested an invalid URL/i.test(output)) {
    throw new Error("OpenVPN 3 could not open browser authentication. Check openvpn3 session-auth in a terminal.");
  }

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait();
    const session = (await listSessions(run)).sessions.find((item) => item.path === path);
    if (!session) throw new Error("The VPN session ended before connecting. Check Show Status.");
    if (isConnected(session)) return "connected";
    if (/^Connection, (?:Client disconnected|Connection failed|Authentication failed)/i.test(session.status ?? "")) {
      throw new Error("The VPN did not connect. Check Show Status.");
    }
  }
  return "pending";
}

export async function disconnectProfile(profile: string, run: Run = runOpenVPN): Promise<boolean> {
  const matching = (await listSessions(run)).sessions.filter((session) => session.profile === profile);
  if (!matching.length) return false;
  if (matching.length > 1) {
    throw new Error("Multiple sessions match this profile. Use Show Status to find the session to disconnect in a terminal.");
  }
  await run(["session-manage", "--disconnect", "--session-path", matching[0].path]);
  return true;
}
