import { Stats, promises as fs } from "fs";
import path from "path";
import { Preferences } from "@/preferences";
import { CommandError, runCommand } from "@/services/command";

const GPG_TIMEOUT_MS = 60_000;

export async function listPasswordEntries(
  storePath: string,
): Promise<string[]> {
  const stats = await safeStat(storePath);
  if (!stats?.isDirectory()) {
    throw new Error(`Password store path "${storePath}" is not a directory`);
  }

  const entries = await walkStore(storePath);
  return entries.sort((a, b) => a.localeCompare(b));
}

export async function decryptPasswordEntry(
  entry: string,
  preferences: Preferences,
  gpgPassword?: string,
): Promise<string> {
  const filePath = path.join(preferences.passwordStorePath, `${entry}.gpg`);
  const stats = await safeStat(filePath);
  if (!stats?.isFile()) {
    throw new Error(`Entry "${entry}" was not found in the password store`);
  }

  const usesLoopback = Boolean(gpgPassword);
  const args = buildDecryptArgs(filePath, usesLoopback);

  try {
    const stdout = await runCommand("gpg", args, preferences, {
      input: gpgPassword ? `${gpgPassword}\n` : undefined,
      timeoutMs: GPG_TIMEOUT_MS,
    });
    return stdout.replace(/\r\n/g, "\n");
  } catch (error) {
    if (error instanceof CommandError) {
      throw new Error(formatGpgError(error, usesLoopback));
    }
    throw error;
  }
}

function buildDecryptArgs(filePath: string, usesLoopback: boolean): string[] {
  const args = ["--quiet", "--yes"];

  if (usesLoopback) {
    args.push(
      "--batch",
      "--pinentry-mode",
      "loopback",
      "--passphrase-fd",
      "0",
    );
  }

  args.push("--decrypt", "--output", "-", filePath);
  return args;
}

function formatGpgError(error: CommandError, usesLoopback: boolean): string {
  const raw = `${error.stderr ?? ""}\n${error.message}`.toLowerCase();

  if (error.code === "ENOENT") {
    return "gpg was not found. Install GnuPG or add its directory to the Pass extension's Additional PATH Entries preference.";
  }

  if (raw.includes("timed out") || raw.includes("interrupted")) {
    return "GPG did not finish. A pinentry prompt may be hidden or unavailable; unlock your key in a terminal or enter the GPG passphrase in the extension.";
  }

  if (usesLoopback && /bad passphrase|bad session key|decryption failed.*bad/.test(raw)) {
    return "Incorrect GPG passphrase.";
  }

  if (
    usesLoopback &&
    (/setting pinentry mode.*failed|not supported|not allowed|allow-loopback|forbidden/.test(raw))
  ) {
    return "GPG loopback pinentry is not enabled. Add 'allow-loopback-pinentry' to ~/.gnupg/gpg-agent.conf, restart gpg-agent, or clear the saved passphrase and use your system pinentry.";
  }

  if (/no pinentry|pinentry|inappropriate ioctl|can't get input|batchmode/.test(raw)) {
    return "GPG needs a passphrase but no pinentry prompt is available. Configure pinentry for gpg-agent or enter the GPG passphrase in the extension.";
  }

  if (/no secret key|secret key not available|decryption failed.*secret key/.test(raw)) {
    return "No matching GPG secret key was found for this pass entry. Import or trust the key used by the password store.";
  }

  return error.message;
}

async function walkStore(root: string, relative = ""): Promise<string[]> {
  const entries: string[] = [];
  const dir = relative ? path.join(root, relative) : root;

  const dirEntries = await fs.readdir(dir, { withFileTypes: true });

  for (const dirent of dirEntries) {
    if (dirent.isDirectory()) {
      if (shouldSkipDirectory(dirent.name)) continue;
      const childRelative = relative
        ? path.join(relative, dirent.name)
        : dirent.name;
      const nested = await walkStore(root, childRelative);
      entries.push(...nested);
      continue;
    }
    if (!dirent.name.endsWith(".gpg")) continue;
    if (dirent.isFile()) {
      const fileRelative = relative
        ? path.join(relative, dirent.name)
        : dirent.name;
      entries.push(normalizeEntryName(fileRelative.slice(0, -4)));
    }
    if (dirent.isSymbolicLink()) {
      const fullPath = path.join(dir, dirent.name);
      const linkStats = await fs.stat(fullPath);
      if (!linkStats.isFile()) continue;
      const fileRelative = relative
        ? path.join(relative, dirent.name)
        : dirent.name;
      entries.push(normalizeEntryName(fileRelative.slice(0, -4)));
    }
  }
  return entries;
}

function shouldSkipDirectory(name: string): boolean {
  return name === ".git";
}

async function safeStat(targetPath: string): Promise<Stats | null> {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function normalizeEntryName(value: string): string {
  return value.split(path.sep).join("/");
}
