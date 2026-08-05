import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import { environment, getPreferenceValues } from "@vicinae/api";

const execFileP = promisify(execFile);

/** Déjà Dup's own registered Google OAuth client (from libdeja). Client-id only, no secret. */
const GOOGLE_CLIENT_ID =
  "916137916439-evn6skqan91m96fmsskk8102e3iepv22.apps.googleusercontent.com";
const GOOGLE_TOKEN_URL = "https://www.googleapis.com/oauth2/v4/token";

export interface Preferences {
  resticPath: string;
  rclonePath: string;
  cacheDir: string;
  autoIndex?: boolean;
  dejaDupFlavor?: string;
  backupPassword?: string;
}

export function autoIndexEnabled(): boolean {
  return getPreferenceValues<Preferences>().autoIndex === true;
}

export function prefs(): Preferences {
  const p = getPreferenceValues<Preferences>();
  return {
    resticPath: p.resticPath?.trim() || "restic",
    rclonePath: p.rclonePath?.trim() || "rclone",
    cacheDir: p.cacheDir?.trim() || join(homedir(), ".cache", "deja-dup", "restic"),
    dejaDupFlavor: p.dejaDupFlavor?.trim() || "auto",
    backupPassword: p.backupPassword ?? "",
  };
}

/** Thrown when the backup exists but this extension cannot read it (e.g. duplicity). */
export class UnsupportedError extends Error {}

/* ---------------------------------------------------------------------------
 * Installation flavor (native / flatpak / snap)
 *
 * Native and Snap (classic confinement) expose Déjà Dup's GSettings, keyring and a
 * usable restic to the host. A Flatpak sandboxes all three, so we detect it and adapt
 * (read the GSettings keyfile directly, run the bundled restic via `flatpak run`), and
 * fall back to the manual "Backup Password" preference where the keyring is unreachable.
 * ------------------------------------------------------------------------- */

export type Flavor = "native" | "flatpak" | "snap";
const FLATPAK_APP = "org.gnome.DejaDup";

let flavorCache: Flavor | null = null;

async function ok(cmd: string, args: string[]): Promise<boolean> {
  try {
    await execFileP(cmd, args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function getFlavor(): Promise<Flavor> {
  const override = prefs().dejaDupFlavor;
  if (override === "native" || override === "flatpak" || override === "snap") return override;
  if (flavorCache) return flavorCache;

  let detected: Flavor = "native";
  if (existsSync(join(homedir(), ".var", "app", FLATPAK_APP)) || (await ok("flatpak", ["info", FLATPAK_APP]))) {
    detected = "flatpak";
  } else if (existsSync("/snap/deja-dup/current") || (await ok("snap", ["list", "deja-dup"]))) {
    detected = "snap";
  }
  flavorCache = detected;
  return detected;
}

export type Backend = string;

export interface DejaConfig {
  backend: Backend;
  tool: string;
  /** Backend-specific target folder / path. */
  folder: string;
  /** rclone remote name (only for the "rclone" backend). */
  rcloneRemote?: string;
  /** Network URI (only for the "remote" backend), e.g. smb://…, sftp://…, davs://…. */
  remoteUri?: string;
  /** Removable-drive identity (only for the "drive" backend). */
  driveUuid?: string;
  driveName?: string;
}

/* ---------------------------------------------------------------------------
 * GSettings reading — from host `gsettings` (native/Snap) or, for a Flatpak
 * install, straight from the sandboxed keyfile the Flatpak writes instead of dconf.
 * ------------------------------------------------------------------------- */

const FLATPAK_KEYFILE = join(
  homedir(),
  ".var/app",
  FLATPAK_APP,
  "config/glib-2.0/settings/keyfile",
);

// dconf paths (verified: schemas map to /org/gnome/deja-dup/<sub>/, lower-cased).
const SCHEMA_SUFFIX: Record<string, string> = {
  "org.gnome.DejaDup": "deja-dup",
  "org.gnome.DejaDup.Local": "deja-dup/local",
  "org.gnome.DejaDup.Google": "deja-dup/google",
  "org.gnome.DejaDup.Microsoft": "deja-dup/microsoft",
  "org.gnome.DejaDup.Remote": "deja-dup/remote",
  "org.gnome.DejaDup.Rclone": "deja-dup/rclone",
  "org.gnome.DejaDup.Drive": "deja-dup/drive",
};

let keyfileCache: Map<string, Map<string, string>> | null = null;

async function readKeyfile(): Promise<Map<string, Map<string, string>>> {
  if (keyfileCache) return keyfileCache;
  const groups = new Map<string, Map<string, string>>();
  try {
    const raw = await readFile(FLATPAK_KEYFILE, "utf8");
    let cur = "";
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const gm = t.match(/^\[(.+)\]$/);
      if (gm) {
        cur = gm[1];
        groups.set(cur, new Map());
        continue;
      }
      const eq = t.indexOf("=");
      if (eq > 0 && cur) groups.get(cur)!.set(t.slice(0, eq).trim(), t.slice(eq + 1).trim());
    }
  } catch {
    // keyfile missing — leave empty
  }
  keyfileCache = groups;
  return groups;
}

function keyfileValue(groups: Map<string, Map<string, string>>, schema: string): Map<string, string> | undefined {
  const suffix = SCHEMA_SUFFIX[schema];
  if (!suffix) return undefined;
  return (
    groups.get(`org/gnome/${suffix}`) ??
    groups.get(suffix) ??
    [...groups.entries()].find(([g]) => g.endsWith(suffix))?.[1]
  );
}

function unquote(v: string): string {
  return v.trim().replace(/^'(.*)'$/, "$1");
}

function parseList(v: string): string[] {
  const m = v.match(/'([^']*)'/g);
  return m ? m.map((s) => s.slice(1, -1)) : [];
}

async function readSetting(schema: string, key: string): Promise<string> {
  if ((await getFlavor()) === "flatpak") {
    const raw = keyfileValue(await readKeyfile(), schema)?.get(key);
    return raw != null ? unquote(raw) : "";
  }
  return execFileP("gsettings", ["get", schema, key])
    .then((r) => unquote(r.stdout.trim()))
    .catch(() => "");
}

async function readSettingList(schema: string, key: string): Promise<string[]> {
  if ((await getFlavor()) === "flatpak") {
    const raw = keyfileValue(await readKeyfile(), schema)?.get(key);
    return raw != null ? parseList(raw) : [];
  }
  return execFileP("gsettings", ["get", schema, key])
    .then((r) => parseList(r.stdout.trim()))
    .catch(() => []);
}

/** Read Déjà Dup's current backend + tool + target from GSettings. */
export async function readConfig(): Promise<DejaConfig> {
  const backend = await readSetting("org.gnome.DejaDup", "backend");
  if (!backend) {
    throw new UnsupportedError(
      "Déjà Dup does not appear to be configured (no backend found).",
    );
  }
  const tool = await readSetting("org.gnome.DejaDup", "tool");

  // Déjà Dup 45+ defaults to restic. Only "duplicity"/"borg" produce repos restic cannot read.
  if (tool === "duplicity" || tool === "borg") {
    throw new UnsupportedError(
      `This backup uses "${tool}", which this extension cannot read. Only restic backups are supported.`,
    );
  }

  const cfg: DejaConfig = { backend, tool, folder: "" };
  switch (backend) {
    case "google":
      cfg.folder = expandFolder(await readSetting("org.gnome.DejaDup.Google", "folder"));
      break;
    case "microsoft":
      cfg.folder = expandFolder(await readSetting("org.gnome.DejaDup.Microsoft", "folder"));
      break;
    case "local":
    case "file":
    case "auto":
      cfg.folder = expandHome(await readSetting("org.gnome.DejaDup.Local", "folder"));
      break;
    case "rclone":
      cfg.folder = expandFolder(await readSetting("org.gnome.DejaDup.Rclone", "folder"));
      cfg.rcloneRemote = await readSetting("org.gnome.DejaDup.Rclone", "remote");
      break;
    case "remote":
      cfg.folder = expandFolder(await readSetting("org.gnome.DejaDup.Remote", "folder"));
      cfg.remoteUri = await readSetting("org.gnome.DejaDup.Remote", "uri");
      break;
    case "drive":
      cfg.folder = expandFolder(await readSetting("org.gnome.DejaDup.Drive", "folder"));
      cfg.driveUuid = await readSetting("org.gnome.DejaDup.Drive", "uuid");
      cfg.driveName = await readSetting("org.gnome.DejaDup.Drive", "name");
      break;
    default:
      break;
  }

  return cfg;
}

/** Déjà Dup uses $HOSTNAME as the default folder token on cloud/remote targets. */
function expandFolder(p: string): string {
  return p === "$HOSTNAME" ? hostname() : p;
}

function expandHome(p: string): string {
  if (p === "$HOME") return homedir();
  if (p.startsWith("$HOME/")) return join(homedir(), p.slice(6));
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p && !p.startsWith("/")) return join(homedir(), p); // relative → under $HOME
  return p;
}

/** Look up a secret by attribute pairs via `secret-tool`. Returns "" if not found. */
async function secretLookup(attrs: string[]): Promise<string> {
  try {
    const { stdout } = await execFileP("secret-tool", ["lookup", ...attrs], {
      maxBuffer: 1024 * 1024,
    });
    // secret-tool does not append a trailing newline; trim only a single one defensively.
    return stdout.replace(/\n$/, "");
  } catch {
    return "";
  }
}

/** The restic repository passphrase (Déjà Dup "Backup encryption password"). */
export async function getPassphrase(): Promise<string> {
  // A manually entered password wins — the escape hatch for Flatpak or custom keyrings.
  const manual = prefs().backupPassword;
  if (manual) return manual;

  const pass = await secretLookup(["owner", "deja-dup", "type", "passphrase"]);
  if (pass) return pass;

  const flavor = await getFlavor();
  if (flavor === "flatpak") {
    throw new UnsupportedError(
      "Déjà Dup is a Flatpak, so its backup password is stored in the app's own sandboxed keyring and can't be read from the host. Enter it under “Backup Password” in this extension's settings (⌘/Ctrl+,), or use the native/Snap Déjà Dup.",
    );
  }
  throw new UnsupportedError(
    "Could not find the backup password in the keyring. Open Déjà Dup once to unlock it, or set it under “Backup Password” in this extension's settings.",
  );
}

interface CachedToken {
  access_token: string;
  /** Epoch milliseconds when the token expires. */
  expires_at: number;
}

async function tokenCachePath(name: string): Promise<string> {
  const dir = environment.supportPath;
  await mkdir(dir, { recursive: true });
  return join(dir, `${name}-token.json`);
}

/**
 * Exchange Déjà Dup's stored Google refresh token for a fresh access token,
 * caching it in the extension support dir until shortly before it expires.
 */
async function getGoogleAccessToken(): Promise<{ token: string; expiry: string }> {
  const cachePath = await tokenCachePath("google");
  const now = Date.now();

  try {
    const cached: CachedToken = JSON.parse(await readFile(cachePath, "utf8"));
    if (cached.access_token && cached.expires_at - 60_000 > now) {
      return { token: cached.access_token, expiry: new Date(cached.expires_at).toISOString() };
    }
  } catch {
    // no / invalid cache — fall through to refresh
  }

  const refresh =
    (await secretLookup([
      "xdg:schema",
      "org.gnome.DejaDup.Google",
      "client_id",
      GOOGLE_CLIENT_ID,
    ])) || (await secretLookup(["client_id", GOOGLE_CLIENT_ID]));

  if (!refresh) {
    throw new UnsupportedError(
      "Could not find the Google Drive token in the keyring. Open Déjà Dup once to reconnect the account, then try again.",
    );
  }

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (HTTP ${res.status}). Re-authorise Déjà Dup.`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Google token refresh returned no access token.");
  }
  const expiresAt = now + (data.expires_in ?? 3600) * 1000;
  const cached: CachedToken = { access_token: data.access_token, expires_at: expiresAt };
  await writeFile(cachePath, JSON.stringify(cached), { mode: 0o600 });

  return { token: data.access_token, expiry: new Date(expiresAt).toISOString() };
}

/* --- Microsoft OneDrive (Personal) --- */
const MS_CLIENT_ID = "5291592c-3c09-44fb-a275-5027aa238645";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_GRAPH_DRIVE = "https://graph.microsoft.com/v1.0/me/drive?select=id";

interface CachedMsAuth {
  tokenJson: string;
  driveId: string;
  expires_at: number;
}

async function getMicrosoftAuth(): Promise<{ tokenJson: string; driveId: string }> {
  const cachePath = await tokenCachePath("microsoft");
  const now = Date.now();
  try {
    const c: CachedMsAuth = JSON.parse(await readFile(cachePath, "utf8"));
    if (c.tokenJson && c.driveId && c.expires_at - 60_000 > now) {
      return { tokenJson: c.tokenJson, driveId: c.driveId };
    }
  } catch {
    // fall through to refresh
  }

  const refresh =
    (await secretLookup(["xdg:schema", "org.gnome.DejaDup.Microsoft", "client_id", MS_CLIENT_ID])) ||
    (await secretLookup(["client_id", MS_CLIENT_ID]));
  if (!refresh) {
    throw new UnsupportedError(
      "Could not find the OneDrive token in the keyring. Open Déjà Dup once to reconnect OneDrive, then try again.",
    );
  }

  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    refresh_token: refresh,
    grant_type: "refresh_token",
    scope: "offline_access Files.ReadWrite",
  });
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`OneDrive token refresh failed (HTTP ${res.status}). Re-authorise Déjà Dup.`);
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("OneDrive token refresh returned no access token.");

  const expiresAt = now + (data.expires_in ?? 3600) * 1000;
  const tokenJson = JSON.stringify({
    access_token: data.access_token,
    token_type: "Bearer",
    refresh_token: data.refresh_token ?? refresh,
    expiry: new Date(expiresAt).toISOString(),
  });

  const dres = await fetch(MS_GRAPH_DRIVE, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  if (!dres.ok) throw new Error(`Could not read the OneDrive drive id (HTTP ${dres.status}).`);
  const drive = (await dres.json()) as { id?: string };
  if (!drive.id) throw new Error("Could not determine the OneDrive drive id.");

  await writeFile(cachePath, JSON.stringify({ tokenJson, driveId: drive.id, expires_at: expiresAt }), {
    mode: 0o600,
  });
  return { tokenJson, driveId: drive.id };
}

/* --- Network (gvfs) and removable-drive mount resolution --- */

async function resolveRemoteMount(uri: string, folder: string): Promise<string> {
  let host = "";
  try {
    host = new URL(uri).hostname;
  } catch {
    throw new UnsupportedError(`Could not parse the network address "${uri}".`);
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  const gvfsDir = `/run/user/${uid}/gvfs`;
  const entries = await readdir(gvfsDir).catch(() => [] as string[]);
  const mount = entries.find((e) => e.includes(`host=${host}`) || e.includes(`server=${host}`));
  if (!mount) {
    throw new UnsupportedError(
      `The network location ${uri} isn't mounted. Open it once in your file manager (Files) so it mounts, then try again.`,
    );
  }
  const base = join(gvfsDir, mount);
  let sub = "";
  try {
    sub = decodeURIComponent(new URL(uri).pathname).replace(/^\/+/, "");
  } catch {
    /* ignore */
  }
  // For SMB the share is already part of the mount name; drop the leading share segment.
  if (mount.startsWith("smb-share:")) sub = sub.split("/").slice(1).join("/");
  const repo = join(base, sub, folder);
  if (!existsSync(repo)) {
    throw new UnsupportedError(
      `The backup folder wasn't found at the mounted network location (${repo}). Make sure it's mounted and the path is correct.`,
    );
  }
  return repo;
}

async function resolveDriveMount(uuid: string, name: string, folder: string): Promise<string> {
  if (!uuid) {
    throw new UnsupportedError("The backup drive is not identified in Déjà Dup's settings.");
  }
  const target = await execFileP("findmnt", ["-rn", "-S", `UUID=${uuid}`, "-o", "TARGET"])
    .then((r) => r.stdout.trim().split("\n")[0])
    .catch(() => "");
  if (!target) {
    throw new UnsupportedError(
      `The backup drive${name ? ` “${name}”` : ""} isn't connected/mounted. Plug it in and mount it, then try again.`,
    );
  }
  return join(target, folder);
}

export interface ResolvedRepo {
  repoUrl: string;
  env: NodeJS.ProcessEnv;
}

/** Build the restic repo URL and the environment needed to reach it for the given backend. */
export async function resolveRepo(config: DejaConfig): Promise<ResolvedRepo> {
  const flavor = await getFlavor();
  const isLocalish =
    config.backend === "local" ||
    config.backend === "file" ||
    config.backend === "auto" ||
    config.backend === "remote" ||
    config.backend === "drive";

  // A Flatpak's cloud tokens live in its sandboxed keyring, unreachable from the host.
  if (flavor === "flatpak" && !isLocalish) {
    throw new UnsupportedError(
      "Déjà Dup is a Flatpak, and cloud backups (Google Drive, OneDrive, rclone) keep their tokens in the app's sandboxed keyring, which can't be reached from here. Use the native or Snap Déjà Dup for cloud backends. Local, network and drive backups still work.",
    );
  }

  const passphrase = await getPassphrase();
  const env: NodeJS.ProcessEnv = { RESTIC_PASSWORD: passphrase, RCLONE_ASK_PASSWORD: "false" };

  switch (config.backend) {
    case "local":
    case "file":
    case "auto":
      if (!config.folder) throw new UnsupportedError("Local backup folder is not configured.");
      return { repoUrl: config.folder, env };

    case "remote":
      if (!config.remoteUri) throw new UnsupportedError("Network backup location is not configured.");
      return { repoUrl: await resolveRemoteMount(config.remoteUri, config.folder), env };

    case "drive":
      return {
        repoUrl: await resolveDriveMount(config.driveUuid ?? "", config.driveName ?? "", config.folder),
        env,
      };

    case "google": {
      const { token, expiry } = await getGoogleAccessToken();
      env.RCLONE_DRIVE_CLIENT_ID = GOOGLE_CLIENT_ID;
      env.RCLONE_DRIVE_SCOPE = "drive.file";
      env.RCLONE_DRIVE_USE_TRASH = "false";
      env.RCLONE_CONFIG = "";
      env.RCLONE_DRIVE_TOKEN = JSON.stringify({ access_token: token, token_type: "Bearer", expiry });
      return { repoUrl: `rclone::drive:${config.folder}`, env };
    }

    case "microsoft": {
      const { tokenJson, driveId } = await getMicrosoftAuth();
      env.RCLONE_CONFIG = "";
      env.RCLONE_ONEDRIVE_CLIENT_ID = MS_CLIENT_ID;
      env.RCLONE_ONEDRIVE_TOKEN = tokenJson;
      env.RCLONE_ONEDRIVE_DRIVE_ID = driveId;
      env.RCLONE_ONEDRIVE_DRIVE_TYPE = "personal";
      return { repoUrl: `rclone::onedrive:${config.folder}`, env };
    }

    case "rclone": {
      if (!config.rcloneRemote) throw new UnsupportedError("rclone remote is not configured.");
      const pass = await secretLookup(["xdg:schema", "org.gnome.DejaDup.Rclone", "type", "password"]);
      if (pass) env.RCLONE_CONFIG_PASS = pass;
      // Named remote from the user's rclone.conf → single colon (not an on-the-fly connection string).
      return { repoUrl: `rclone:${config.rcloneRemote}:${config.folder}`, env };
    }

    default:
      throw new UnsupportedError(
        `The "${config.backend}" backend isn't supported. Works today: local, network, drive, Google Drive, OneDrive, rclone.`,
      );
  }
}

/* ---------------------------------------------------------------------------
 * restic invocation
 * ------------------------------------------------------------------------- */

export interface Snapshot {
  id: string;
  short_id: string;
  time: string;
  hostname: string;
  username: string;
  paths: string[];
  tags?: string[];
  program_version?: string;
  summary?: {
    total_files_processed?: number;
    total_bytes_processed?: number;
    files_new?: number;
    files_changed?: number;
    files_unmodified?: number;
    data_added?: number;
    backup_start?: string;
    backup_end?: string;
  };
}

export interface ResticNode {
  name: string;
  type: "file" | "dir" | "symlink" | string;
  path: string;
  size?: number;
  mode?: number;
  mtime?: string;
  uid?: number;
  gid?: number;
}

function humanExit(code: number | null, stderr: string): string {
  switch (code) {
    case 10:
      return "Backup repository not found or unreachable.";
    case 11:
      return "Repository is locked by another operation.";
    case 12:
      return "Wrong backup password.";
    case 130:
      return "Cancelled.";
    default:
      return stderr.trim().split("\n").slice(-3).join("\n") || `restic exited with code ${code}.`;
  }
}

async function buildEnvAndBase(config?: DejaConfig): Promise<{
  repoUrl: string;
  cmd: string;
  env: NodeJS.ProcessEnv;
  base: string[];
}> {
  const cfg = config ?? (await readConfig());
  const { repoUrl, env } = await resolveRepo(cfg);
  const p = prefs();
  const flavor = await getFlavor();
  const resticArgs = [
    "--repo",
    repoUrl,
    "--no-lock",
    "--cache-dir",
    p.cacheDir,
    "--option",
    `rclone.program=${flavor === "flatpak" ? "rclone" : p.rclonePath}`,
  ];

  if (flavor === "flatpak") {
    // Run the Flatpak's bundled restic inside the sandbox. flatpak filters the environment,
    // so the backend env must be passed as explicit --env= flags before the app id.
    const envFlags = Object.entries(env).map(([k, v]) => `--env=${k}=${v ?? ""}`);
    return {
      repoUrl,
      cmd: "flatpak",
      base: ["run", "--filesystem=host", ...envFlags, "--command=restic", FLATPAK_APP, ...resticArgs],
      env: { ...process.env },
    };
  }

  // native + snap (classic confinement) → host restic works directly.
  return { repoUrl, cmd: p.resticPath, base: resticArgs, env: { ...process.env, ...env } };
}

/** Run a restic subcommand, returning stdout. Throws a human-readable Error on failure. */
export async function restic(args: string[], config?: DejaConfig): Promise<string> {
  const { cmd, env, base } = await buildEnvAndBase(config);
  try {
    const { stdout } = await execFileP(cmd, [...base, ...args], {
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const e = err as { code?: number; stderr?: string };
    // Exit code 3 = could not read some source files; output is still valid.
    if (e.code === 3 && typeof (err as { stdout?: string }).stdout === "string") {
      return (err as { stdout: string }).stdout;
    }
    throw new Error(humanExit(e.code ?? null, e.stderr ?? ""));
  }
}

export async function listSnapshots(config?: DejaConfig): Promise<Snapshot[]> {
  const out = await restic(["snapshots", "--json"], config);
  const arr = JSON.parse(out || "[]") as Snapshot[];
  return arr.sort((a, b) => (a.time < b.time ? 1 : -1));
}

/**
 * List one directory level inside a snapshot. `restic ls` emits NDJSON: the first
 * line is the snapshot object, the rest are nodes. Without `--recursive` and with an
 * explicit directory path, restic returns only that subtree's direct children (plus the
 * ancestor dirs it traverses, which we filter out). Passing no path would list the ENTIRE
 * snapshot recursively — for a large home dir that is hundreds of MB, so always pass one.
 */
export async function listDir(
  snapshotId: string,
  path: string,
  config?: DejaConfig,
): Promise<ResticNode[]> {
  const dir = path && path !== "" ? path : "/";
  const out = await restic(["ls", snapshotId, dir, "--json"], config);

  const nodes: ResticNode[] = [];
  const wanted = dir === "/" ? "" : dir.replace(/\/$/, "");
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    let obj: ResticNode & { struct_type?: string };
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!obj.path || obj.struct_type === "snapshot" || !obj.type) continue;
    const parent = obj.path.slice(0, obj.path.lastIndexOf("/")) || "";
    if (parent === wanted) nodes.push(obj);
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

/* ---------------------------------------------------------------------------
 * Local search index
 *
 * `restic find` over a cloud backend re-walks every snapshot's tree and takes
 * many seconds per query — unusable for interactive search. Instead we walk one
 * snapshot ONCE (streamed, so a million files never sit in memory), write a compact
 * index to disk, and search it locally and instantly afterwards.
 * ------------------------------------------------------------------------- */

export interface IndexEntry {
  path: string;
  name: string;
  type: string;
  size: number;
}

export interface IndexMeta {
  snapshotId: string;
  shortId: string;
  count: number;
  builtAt: number;
}

function indexPaths(shortId: string) {
  const dir = environment.supportPath;
  return {
    data: join(dir, `index-${shortId}.tsv`),
    meta: join(dir, `index-${shortId}.meta.json`),
  };
}

export async function readIndexMeta(shortId: string): Promise<IndexMeta | null> {
  try {
    return JSON.parse(await readFile(indexPaths(shortId).meta, "utf8")) as IndexMeta;
  } catch {
    return null;
  }
}

export async function hasIndex(shortId: string): Promise<boolean> {
  return (await readIndexMeta(shortId)) !== null;
}

/**
 * Delete index files for snapshots that no longer exist in the repository (e.g. pruned by
 * Déjà Dup's retention). A new backup keeps its own new index; only orphaned ones are removed.
 */
export async function pruneOrphanIndexes(validShortIds: string[]): Promise<void> {
  const keep = new Set(validShortIds);
  try {
    for (const f of await readdir(environment.supportPath)) {
      const m = f.match(/^index-(.+)\.(tsv|meta\.json)$/);
      if (m && !keep.has(m[1])) {
        await unlink(join(environment.supportPath, f)).catch(() => undefined);
      }
    }
  } catch {
    // support dir may not exist yet — nothing to prune
  }
}

/**
 * Walk a snapshot recursively and stream every file/dir into a local TSV index.
 * onProgress is called periodically with the running count.
 */
export async function buildFileIndex(
  snapshot: Snapshot,
  onProgress: (count: number) => void,
  config?: DejaConfig,
): Promise<IndexMeta> {
  const cfg = config ?? (await readConfig());
  const { cmd, env, base } = await buildEnvAndBase(cfg);
  const { data, meta } = indexPaths(snapshot.short_id);
  await mkdir(environment.supportPath, { recursive: true });

  const { createWriteStream } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  const roots = snapshot.paths.length ? snapshot.paths : ["/"];

  let count = 0;
  const out = createWriteStream(data, { flags: "w" });

  for (const root of roots) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        cmd,
        [...base, "ls", snapshot.id, root, "--recursive", "--json"],
        { env },
      );
      let buf = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buf += chunk;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let obj: { path?: string; name?: string; type?: string; size?: number; struct_type?: string };
          try {
            obj = JSON.parse(line);
          } catch {
            continue;
          }
          if (!obj.path || obj.struct_type === "snapshot" || !obj.type) continue;
          out.write(`${obj.type}\t${obj.size ?? 0}\t${obj.path}\n`);
          if (++count % 5000 === 0) onProgress(count);
        }
      });
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        // Exit 3 = some files unreadable; index is still valid.
        if (code === 0 || code === 3) resolve();
        else reject(new Error(humanExit(code, stderr)));
      });
    });
  }

  await new Promise<void>((resolve) => out.end(resolve));
  const info: IndexMeta = {
    snapshotId: snapshot.id,
    shortId: snapshot.short_id,
    count,
    builtAt: Date.now(),
  };
  await writeFile(meta, JSON.stringify(info));
  onProgress(count);
  return info;
}

/** Load the on-disk index into memory (array of raw TSV lines). */
export async function loadIndex(shortId: string): Promise<string[]> {
  try {
    const raw = await readFile(indexPaths(shortId).data, "utf8");
    return raw.length ? raw.split("\n") : [];
  } catch {
    return [];
  }
}

/** Direct children of `path` from a loaded index — the local, instant equivalent of listDir. */
export function listDirFromLines(lines: string[], path: string): IndexEntry[] {
  const wanted = path === "/" || path === "" ? "" : path.replace(/\/$/, "");
  const out: IndexEntry[] = [];
  for (const line of lines) {
    if (!line) continue;
    const firstTab = line.indexOf("\t");
    const secondTab = line.indexOf("\t", firstTab + 1);
    if (secondTab < 0) continue;
    const p = line.slice(secondTab + 1);
    const parent = p.slice(0, p.lastIndexOf("/")) || "";
    if (parent !== wanted) continue;
    out.push({
      type: line.slice(0, firstTab),
      size: Number(line.slice(firstTab + 1, secondTab)) || 0,
      path: p,
      name: p.slice(p.lastIndexOf("/") + 1),
    });
  }
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/** Filter pre-loaded index lines by a case-insensitive substring, capped for rendering. */
export function searchIndex(lines: string[], query: string, limit = 200): IndexEntry[] {
  const q = query.toLowerCase();
  const out: IndexEntry[] = [];
  for (const line of lines) {
    if (!line) continue;
    // Match against the path portion (after the second tab) case-insensitively.
    const firstTab = line.indexOf("\t");
    const secondTab = line.indexOf("\t", firstTab + 1);
    if (secondTab < 0) continue;
    const path = line.slice(secondTab + 1);
    if (!path.toLowerCase().includes(q)) continue;
    out.push({
      type: line.slice(0, firstTab),
      size: Number(line.slice(firstTab + 1, secondTab)) || 0,
      path,
      name: path.slice(path.lastIndexOf("/") + 1),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Dump a single file's contents from a snapshot to a local path (for preview). */
export async function dumpFile(
  snapshotId: string,
  path: string,
  targetPath: string,
  config?: DejaConfig,
): Promise<void> {
  const { cmd, env, base } = await buildEnvAndBase(config);
  const { createWriteStream } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(targetPath, { mode: 0o600 });
    const child = spawn(cmd, [...base, "dump", snapshotId, path], { env });
    let stderr = "";
    child.stdout.pipe(out);
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      out.close();
      if (code === 0) resolve();
      else reject(new Error(humanExit(code, stderr)));
    });
  });
}

/** Restore a single file/dir from a snapshot into targetDir. */
export async function restorePath(
  snapshotId: string,
  path: string,
  targetDir: string,
  config?: DejaConfig,
): Promise<void> {
  await restic(
    ["restore", snapshotId, "--target", targetDir, "--include", path],
    config,
  );
}

export interface RepoStats {
  total_size?: number;
  total_file_count?: number;
  snapshots_count?: number;
}

export async function repoStats(config?: DejaConfig): Promise<RepoStats> {
  try {
    const out = await restic(["stats", "latest", "--json"], config);
    return JSON.parse(out || "{}") as RepoStats;
  } catch {
    return {};
  }
}

export interface BackupStatus {
  backend: string;
  tool: string;
  folder: string;
  lastBackup: string;
  lastRun: string;
  periodic: boolean;
  periodicPeriod: string;
  includeList: string[];
  excludeList: string[];
}

/** Read a human-facing status summary straight from GSettings (no repo access needed). */
export async function readStatus(): Promise<BackupStatus> {
  const cfg = await readConfig();
  const [lastBackup, lastRun, periodic, period, includeList, excludeList] = await Promise.all([
    readSetting("org.gnome.DejaDup", "last-backup"),
    readSetting("org.gnome.DejaDup", "last-run"),
    readSetting("org.gnome.DejaDup", "periodic"),
    readSetting("org.gnome.DejaDup", "periodic-period"),
    readSettingList("org.gnome.DejaDup", "include-list"),
    readSettingList("org.gnome.DejaDup", "exclude-list"),
  ]);
  const target =
    cfg.remoteUri || (cfg.rcloneRemote ? `${cfg.rcloneRemote}:${cfg.folder}` : cfg.folder);
  return {
    backend: cfg.backend,
    tool: cfg.tool === "unset" ? "restic (auto)" : cfg.tool,
    folder: target,
    lastBackup,
    lastRun,
    periodic: periodic === "true",
    periodicPeriod: period,
    includeList,
    excludeList,
  };
}

