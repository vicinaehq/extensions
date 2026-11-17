import { constants, type Stats } from "node:fs";
import { access, lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
// The package's UMD entry hides relative requires inside a factory. Import ESM
// explicitly so vici/esbuild includes its internals in the standalone bundle.
import { applyEdits, getNodeValue, modify, parseTree, type Node, type ParseError } from "jsonc-parser/lib/esm/main.js";

const MAX_CONFIG_BYTES = 1024 * 1024;
const messages = {
  invalid: "Settings must be valid UTF-8 JSONC with no duplicate keys. No changes were made.",
  unsupported: "Automatic setup requires a regular, user-owned, non-linked settings file without imports or VICINAE_OVERRIDES. Use Vicinae's manual alias settings for this configuration.",
  conflict: "The ! alias is already assigned to another command. No aliases were changed. Resolve the conflict in Vicinae Settings first.",
  existing: "Bang already has a different alias. Setup will not replace it. Change it manually in Vicinae Settings if desired.",
  disabled: "Bang or its command is disabled. Enable it in Vicinae Settings before setting up the alias.",
  changed: "Settings changed during setup. No setup update was applied. Retry when no other settings are being edited.",
  locked: "Another alias setup may be running. Wait for it to finish. If it crashed, check the settings.json.bang-alias.lock file before removing it manually.",
  backup: "Could not create a complete private settings backup. The configuration was not changed.",
  target: "Could not identify this Bang installation. Set the alias manually in Vicinae Settings.",
} as const;

export class AliasSetupError extends Error {
  constructor(public readonly code: keyof typeof messages) { super(messages[code]); }
}

export type AliasTarget = { provider: string; command: "bang" };
type Snapshot = { bytes: Buffer; stat: Stats };
export type AliasPlan = { file: string; original: Snapshot; next: Buffer; changed: boolean };
export type AliasResult = { changed: boolean; backupPath?: string };

export function defaultAliasConfigPath(env = process.env, home = os.homedir()): string {
  const base = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(home, ".config");
  return path.join(base, "vicinae", "settings.json");
}

/** Core's provider ID is @manifest-author/installed-directory, including store prefixes. */
export function aliasTarget(author: string, assetsPath: string): AliasTarget {
  const directory = path.basename(path.dirname(assetsPath));
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
  if (typeof author !== "string" || !valid.test(author) || !path.isAbsolute(assetsPath) || path.basename(assetsPath) !== "assets" || !valid.test(directory)) throw new AliasSetupError("target");
  return { provider: `@${author}/${directory}`, command: "bang" };
}

function parseConfig(text: string): { tree: Node; value: Record<string, unknown> } {
  const errors: ParseError[] = [];
  let tree: Node | undefined;
  try { tree = parseTree(text, errors, { allowTrailingComma: false }); }
  catch { throw new AliasSetupError("invalid"); }
  if (!tree || errors.length || tree.type !== "object") throw new AliasSetupError("invalid");
  const visit = (node: Node) => {
    if (node.type === "object") {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const key = property.children?.[0].value as string;
        if (keys.has(key)) throw new AliasSetupError("invalid");
        keys.add(key);
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  try { visit(tree); }
  catch { throw new AliasSetupError("invalid"); }
  return { tree, value: getNodeValue(tree) as Record<string, unknown> };
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AliasSetupError("invalid");
  return value as Record<string, unknown>;
}

function sameStat(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.mode === b.mode && a.uid === b.uid && a.gid === b.gid;
}

async function snapshot(file: string): Promise<Snapshot> {
  if (!path.isAbsolute(file) || file.includes("\0")) throw new AliasSetupError("unsupported");
  const stat = await lstat(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_CONFIG_BYTES || stat.uid !== process.getuid?.() || await realpath(file) !== file) throw new AliasSetupError("unsupported");
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW | constants.O_NOCTTY);
  try {
    const before = await handle.stat();
    if (!sameStat(stat, before)) throw new AliasSetupError("changed");
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== stat.size || !sameStat(stat, await handle.stat())) throw new AliasSetupError("changed");
    return { bytes: bytes.subarray(0, length), stat };
  } finally { await handle.close(); }
}

/** Read-only planning. Reject layered configs rather than miss an inherited alias conflict. */
export async function planAliasSetup(file: string, target: AliasTarget, env = process.env): Promise<AliasPlan> {
  if (!/^@[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(target.provider) || target.command !== "bang") throw new AliasSetupError("target");
  if (env.VICINAE_OVERRIDES) throw new AliasSetupError("unsupported");
  const original = await snapshot(file);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(original.bytes); }
  catch { throw new AliasSetupError("invalid"); }
  const bom = text.startsWith("\ufeff") ? "\ufeff" : "";
  const body = text.slice(bom.length);
  const { value } = parseConfig(body);
  if (value.imports !== undefined && (!Array.isArray(value.imports) || value.imports.length)) throw new AliasSetupError("unsupported");
  const providers = value.providers === undefined ? {} : object(value.providers);
  let existing: string | undefined;
  for (const [providerId, rawProvider] of Object.entries(providers)) {
    const provider = object(rawProvider);
    if (providerId === target.provider && provider.enabled === false) throw new AliasSetupError("disabled");
    const entries = provider.entrypoints === undefined ? {} : object(provider.entrypoints);
    for (const [commandId, rawCommand] of Object.entries(entries)) {
      const command = object(rawCommand);
      if (command.alias !== undefined && command.alias !== null && typeof command.alias !== "string") throw new AliasSetupError("invalid");
      const isTarget = providerId === target.provider && commandId === target.command;
      if (isTarget) {
        if (command.enabled === false) throw new AliasSetupError("disabled");
        existing = command.alias as string | undefined;
      } else if (typeof command.alias === "string" && command.alias.trim() === "!") throw new AliasSetupError("conflict");
    }
  }
  if (existing && existing !== "!") throw new AliasSetupError("existing");
  if (existing === "!") return { file, original, next: original.bytes, changed: false };
  const edits = modify(body, ["providers", target.provider, "entrypoints", target.command, "alias"], "!", {
    formattingOptions: { insertSpaces: !/^\t/m.test(body), tabSize: 2, eol: body.includes("\r\n") ? "\r\n" : "\n" },
  });
  const next = bom + applyEdits(body, edits);
  parseConfig(next.slice(bom.length));
  return { file, original, next: Buffer.from(next, "utf8"), changed: true };
}

async function checkUnchanged(plan: AliasPlan) {
  const current = await snapshot(plan.file);
  if (!sameStat(current.stat, plan.original.stat) || !current.bytes.equals(plan.original.bytes)) throw new AliasSetupError("changed");
}

/** Opt-in transaction: private byte-for-byte backup, then guarded atomic replacement. */
export async function applyAliasSetup(plan: AliasPlan): Promise<AliasResult> {
  if (!plan.changed) return { changed: false };
  const lockPath = `${plan.file}.bang-alias.lock`;
  const lock = await open(lockPath, "wx", 0o600).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new AliasSetupError("locked");
    throw error;
  });
  const backupPath = `${plan.file}.bang-backup-${Date.now()}-${randomUUID()}`;
  const temporaryPath = `${plan.file}.bang-${randomUUID()}.tmp`;
  let temporaryCreated = false;
  try {
    await access(plan.file, constants.W_OK);
    await checkUnchanged(plan);
    let backupCreated = false;
    try {
      const backup = await open(backupPath, "wx", 0o600);
      backupCreated = true;
      try { await backup.chmod(0o600); await backup.writeFile(plan.original.bytes); await backup.sync(); }
      finally { await backup.close(); }
    } catch {
      if (backupCreated) await unlink(backupPath).catch(() => {});
      throw new AliasSetupError("backup");
    }
    const temporary = await open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    try {
      await temporary.chown(plan.original.stat.uid, plan.original.stat.gid);
      await temporary.chmod(plan.original.stat.mode & 0o777);
      await temporary.writeFile(plan.next);
      await temporary.sync();
    } finally { await temporary.close(); }
    await checkUnchanged(plan);
    await rename(temporaryPath, plan.file);
    temporaryCreated = false;
    return { changed: true, backupPath };
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch(() => {});
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}

export function aliasSetupError(error: unknown): string {
  if (error instanceof AliasSetupError) return messages[error.code];
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "Settings file not found. Choose the active Vicinae settings file, or set the alias manually. Setup will not create a new config.";
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") return "Settings are not writable. Check file/directory permissions, or use Vicinae's manual alias settings.";
  return "Could not set up the alias. No configuration rollback was attempted; any completed backup was kept. Check the selected file or use Vicinae Settings.";
}
