import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { privateLauncherDirectory, userDataDirectory } from "./launcher-paths";
import type { AICommand } from "./types";

export interface DesktopEntryOptions {
  directory: string;
  entrypoint: string;
  executable: string;
  icon: string;
}

export function applicationsDirectory(): string {
  return join(privateLauncherDirectory(), "applications");
}

export function legacyApplicationsDirectory(): string {
  return join(userDataDirectory(), "applications");
}

function field(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

// Desktop Exec is parsed as argv, not as a shell command. It has its own
// quoting and percent-field syntax, applied after desktop string unescaping.
function argument(value: string): string {
  return field(
    '"' + value.replace(/[\\"`$]/g, "\\$&").replace(/%/g, "%%") + '"',
  );
}

export function desktopEntryPath(
  commandId: string,
  options: DesktopEntryOptions,
): string {
  const identity = createHash("sha256")
    .update(options.entrypoint + "\0" + commandId)
    .digest("hex");
  return join(options.directory, `vicinae-ai-command-${identity}.desktop`);
}

export function desktopEntryText(
  command: AICommand,
  options: DesktopEntryOptions,
): string {
  if (options.executable.includes("%"))
    throw new Error(
      "Vicinae cannot launch desktop entries from executable paths containing %. Install its launcher in a standard bin directory.",
    );
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${field(command.name.replace(/[\r\n]+/g, " "))}`,
    "Comment=Transform text with AI Commands",
    `Icon=${field(options.icon)}`,
    `Exec=${[options.executable, "cmd", "launch", options.entrypoint, command.id].map(argument).join(" ")}`,
    "Terminal=false",
    "StartupNotify=false",
    "Categories=Utility;",
    "Keywords=AI;Translate;Rewrite;Vicinae;",
    "X-Vicinae-AI-Commands=true",
    "Actions=edit;",
    "",
    "[Desktop Action edit]",
    "Name=Edit AI Command",
    `Exec=${[options.executable, "cmd", "launch", options.entrypoint, command.id, "edit"].map(argument).join(" ")}`,
    "",
  ].join("\n");
}

export async function migrateDesktopEntry(
  command: AICommand,
  options: DesktopEntryOptions,
  legacyDirectory: string,
): Promise<void> {
  await publishDesktopEntry(command, options);
  if (legacyDirectory !== options.directory)
    await removeDesktopEntry(command.id, {
      ...options,
      directory: legacyDirectory,
    });
}

export async function publishDesktopEntry(
  command: AICommand,
  options: DesktopEntryOptions,
): Promise<void> {
  await mkdir(options.directory, { recursive: true });
  const destination = desktopEntryPath(command.id, options);
  try {
    const current = await readFile(destination, "utf8");
    if (!current.split("\n").includes("X-Vicinae-AI-Commands=true"))
      throw new Error(
        "The main-search entry was replaced by another file. It has not been overwritten.",
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = join(options.directory, `.vicinae-ai-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, desktopEntryText(command, options), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    // Atomic rename also triggers Vicinae's application-directory watcher.
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export async function removeDesktopEntry(
  commandId: string,
  options: DesktopEntryOptions,
): Promise<void> {
  const path = desktopEntryPath(commandId, options);
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!content.split("\n").includes("X-Vicinae-AI-Commands=true"))
    throw new Error(
      "The main-search entry was replaced by another file. It has not been removed.",
    );
  await unlink(path);
}

export async function withDesktopEntriesRemoved<T>(
  commandId: string,
  options: DesktopEntryOptions[],
  removeCommand: () => Promise<T>,
): Promise<T> {
  const snapshots: {
    path: string;
    content: string;
    options: DesktopEntryOptions;
  }[] = [];
  for (const item of options) {
    const path = desktopEntryPath(commandId, item);
    if (snapshots.some((snapshot) => snapshot.path === path)) continue;
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!content.split("\n").includes("X-Vicinae-AI-Commands=true"))
      throw new Error(
        "A main-search entry was replaced by another file. Nothing has been removed.",
      );
    snapshots.push({ path, content, options: item });
  }
  const removed: typeof snapshots = [];
  try {
    for (const snapshot of snapshots) {
      await removeDesktopEntry(commandId, snapshot.options);
      removed.push(snapshot);
    }
    return await removeCommand();
  } catch (error) {
    const restored = await Promise.allSettled(
      removed.map((snapshot) =>
        writeFile(snapshot.path, snapshot.content, { flag: "wx", mode: 0o600 }),
      ),
    );
    if (restored.some((result) => result.status === "rejected"))
      throw new Error(
        "Deletion failed and some launcher entries could not be restored. Use Repair Main Search Entry.",
        { cause: error },
      );
    throw error;
  }
}
