import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { userInfo } from "node:os";

const execFileP = promisify(execFile);

export class SnapperError extends Error {}
export class NoAccessError extends SnapperError {}

export interface SnapperConfig {
  config: string;
  subvolume: string;
}

export interface Snapshot {
  number: number;
  type: string; // single | pre | post
  date: string | null;
  user?: string;
  cleanup?: string;
  description?: string;
  active?: boolean;
  default?: boolean;
  "pre-number"?: number | null;
  userdata?: Record<string, string> | null;
}

export interface Change {
  status: string; // e.g. "+..." , "c...", "-..."
  path: string;
}

const SNAPPER = "snapper";

async function run(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileP(SNAPPER, args, { maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; code?: number; message?: string };
    const msg = (e.stderr || e.message || "").trim();
    if (/no permissions/i.test(msg)) {
      throw new NoAccessError("No permission to read this Snapper config.");
    }
    throw new SnapperError(msg || `snapper failed (code ${e.code}).`);
  }
}

/**
 * Run snapper but keep stdout even on a non-zero exit. `snapper status` exits 1 and
 * writes "IO Error"/permission diagnostics to stderr when comparing paths a non-root
 * user cannot read — yet the readable changes are still printed to stdout.
 */
async function runAllowFail(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileP(SNAPPER, args, { maxBuffer: 32 * 1024 * 1024 });
    return { stdout, stderr: stderr || "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (/no permissions/i.test(e.stderr || "")) {
      throw new NoAccessError("No permission to read this Snapper config.");
    }
    return { stdout: e.stdout || "", stderr: e.stderr || e.message || "" };
  }
}

export async function listConfigs(): Promise<SnapperConfig[]> {
  const out = await run(["--jsonout", "list-configs"]);
  const data = JSON.parse(out) as { configs?: SnapperConfig[] };
  return data.configs ?? [];
}

/** True if the current user can read snapshots (ALLOW_USERS granted) for at least one config. */
export async function hasAccess(): Promise<boolean> {
  let configs: SnapperConfig[];
  try {
    configs = await listConfigs();
  } catch {
    return false;
  }
  if (configs.length === 0) return true; // nothing to gate on
  try {
    await listSnapshots(configs[0].config);
    return true;
  } catch (e) {
    if (e instanceof NoAccessError) return false;
    // A different error (e.g. transient) shouldn't force the setup screen.
    return true;
  }
}

export async function listSnapshots(config: string): Promise<Snapshot[]> {
  const out = await run(["-c", config, "--jsonout", "list", "--disable-used-space"]);
  const data = JSON.parse(out) as Record<string, Snapshot[]>;
  // snapper keys the array by config name; take whichever array is present.
  const arr = data[config] ?? Object.values(data).find(Array.isArray) ?? [];
  return (arr as Snapshot[]).sort((a, b) => b.number - a.number);
}

export interface StatusResult {
  changes: Change[];
  /** True if some paths could not be read (e.g. root-owned files, comparing as a user). */
  hadReadErrors: boolean;
}

/**
 * Changed files between two snapshot numbers (0 = current system). `snapper status`
 * emits plain text (`<flags> <path>` per line), NOT JSON — even with --jsonout — so we
 * parse the text and tolerate the permission diagnostics it prints for unreadable paths.
 */
export async function getStatus(config: string, pre: number, post: number): Promise<StatusResult> {
  const { stdout, stderr } = await runAllowFail(["-c", config, "status", `${pre}..${post}`]);
  const changes: Change[] = [];
  for (const line of stdout.split("\n")) {
    // Each change line is "<status flags><space><absolute path>", e.g. "c..... /etc/hosts".
    const m = line.match(/^(\S+)\s+(\/.*)$/);
    if (m) changes.push({ status: m[1], path: m[2] });
  }
  const hadReadErrors = /IO Error|Permission denied|errno/i.test(stderr);
  return { changes, hadReadErrors };
}

/** Unified diff of a single file between two snapshots (0 = current system). */
export async function getDiff(
  config: string,
  pre: number,
  post: number,
  path: string,
): Promise<string> {
  const { stdout, stderr } = await runAllowFail([
    "-c",
    config,
    "diff",
    `${pre}..${post}`,
    path,
  ]);
  if (!stdout.trim() && /IO Error|Permission denied|errno/i.test(stderr)) {
    throw new SnapperError("This file needs root to read. Open Btrfs Assistant for a full diff.");
  }
  return stdout;
}

export async function createSnapshot(config: string, description: string): Promise<void> {
  const args = ["-c", config, "create", "--type", "single", "--print-number"];
  if (description) args.push("--description", description);
  await run(args);
}

export async function deleteSnapshot(config: string, num: number): Promise<void> {
  await run(["-c", config, "delete", String(num)]);
}

/**
 * Path at which a snapshot's read-only copy is mounted, e.g. /.snapshots/12/snapshot.
 * For the root subvolume ("/") this is /.snapshots/<n>/snapshot; for others it is
 * <subvolume>/.snapshots/<n>/snapshot.
 */
export function snapshotMountPath(cfg: SnapperConfig, num: number): string {
  const base = cfg.subvolume === "/" ? "" : cfg.subvolume.replace(/\/$/, "");
  return `${base}/.snapshots/${num}/snapshot`;
}

/**
 * Grant the current user passwordless read access to every Snapper config by setting
 * ALLOW_USERS (preserving existing entries) and SYNC_ACL=yes. Runs once via pkexec.
 */
export async function setupAccess(): Promise<void> {
  const user = userInfo().username;
  // Baked-in username comes from the OS, not user input; safe to interpolate.
  const script = [
    "set -e",
    'for c in $(snapper --csvout --no-headers list-configs | cut -d, -f1); do',
    '  cur=$(snapper -c "$c" --csvout --no-headers get-config 2>/dev/null | awk -F, \'$1=="ALLOW_USERS"{print $2}\')',
    `  case ",$cur," in *",${user},"*) users="$cur";; *) users="\${cur:+$cur,}${user}";; esac`,
    `  snapper -c "$c" set-config ALLOW_USERS="$users" SYNC_ACL=yes`,
    "done",
  ].join("\n");

  try {
    await execFileP("pkexec", ["sh", "-c", script], { maxBuffer: 1024 * 1024 });
  } catch (err) {
    const e = err as { code?: number; stderr?: string; message?: string };
    // pkexec exit 126 = user dismissed the auth dialog; 127 = auth failed.
    if (e.code === 126 || e.code === 127) {
      throw new SnapperError("Authorisation was cancelled.");
    }
    throw new SnapperError((e.stderr || e.message || "Setup failed.").trim());
  }
}

export interface SearchHit {
  /** Path as it appears inside the snapshot (mount prefix stripped). */
  path: string;
  name: string;
  type: string; // f | d | l
  size: number;
  /** Absolute path on disk inside the read-only snapshot mount. */
  fullPath: string;
}

/**
 * Search a snapshot's read-only mount with local `find`. This is fast because it is
 * plain local disk I/O — no network, unlike a cloud backup. Results are capped and the
 * search is aborted once the cap is reached.
 */
export function searchInSnapshot(
  mountPath: string,
  query: string,
  limit = 300,
): Promise<SearchHit[]> {
  return new Promise((resolve, reject) => {
    const hits: SearchHit[] = [];
    // Args are passed without a shell, so the glob pattern cannot inject commands.
    const child = execFile(
      "find",
      [mountPath, "-iname", `*${query}*`, "-printf", "%y\t%s\t%p\n"],
      { maxBuffer: 16 * 1024 * 1024 },
      () => {
        // ignore exit code / SIGTERM; we resolve with whatever we collected
        resolve(hits);
      },
    );
    let buf = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const t1 = line.indexOf("\t");
        const t2 = line.indexOf("\t", t1 + 1);
        if (t2 < 0) continue;
        const full = line.slice(t2 + 1);
        const rel = full.slice(mountPath.length) || "/";
        hits.push({
          type: line.slice(0, t1),
          size: Number(line.slice(t1 + 1, t2)) || 0,
          fullPath: full,
          path: rel,
          name: rel.slice(rel.lastIndexOf("/") + 1),
        });
        if (hits.length >= limit) {
          child.kill("SIGTERM");
          resolve(hits);
          return;
        }
      }
    });
    child.on("error", reject);
  });
}

export function launchBtrfsAssistant(): void {
  execFile("btrfs-assistant-launcher", (err) => {
    if (err) execFile("btrfs-assistant", () => undefined);
  });
}
