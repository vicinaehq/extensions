import { Stats, promises as fs } from "fs";
import path from "path";
import { Preferences } from "@/preferences";
import { runCommand } from "@/services/command";

export async function listPasswordEntries(storePath: string): Promise<string[]> {
  const stats = await safeStat(storePath);
  if (!stats?.isDirectory()) {
    throw new Error(`Password store path "${storePath}" is not a directory`);
  }

  const entries = await walkStore(storePath);
  return entries.sort((a, b) => a.localeCompare(b));
}

export async function decryptPasswordEntry(entry: string, preferences: Preferences): Promise<string> {
  const filePath = path.join(preferences.passwordStorePath, `${entry}.gpg`);
  const stats = await safeStat(filePath);
  if (!stats?.isFile()) {
    throw new Error(`Entry "${entry}" was not found in the password store`);
  }

  const args = ["--batch", "--yes"];
  if (preferences.gpgPassphrase) {
    args.push("--pinentry-mode=loopback", "--passphrase", preferences.gpgPassphrase);
  }
  args.push("-d", filePath);

  const stdout = await runCommand("gpg", args, preferences);
  return stdout.replace(/\r\n/g, "\n");
}

async function walkStore(root: string, relative = ""): Promise<string[]> {
  const entries: string[] = [];
  const dir = relative ? path.join(root, relative) : root;

  const dirEntries = await fs.readdir(dir, { withFileTypes: true });

  for (const dirent of dirEntries) {
    if (dirent.isDirectory()) {
      if (shouldSkipDirectory(dirent.name)) continue;
      const childRelative = relative ? path.join(relative, dirent.name) : dirent.name;
      const nested = await walkStore(root, childRelative);
      entries.push(...nested);
    } else if (dirent.isFile() && dirent.name.endsWith(".gpg")) {
      const fileRelative = relative ? path.join(relative, dirent.name) : dirent.name;
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
