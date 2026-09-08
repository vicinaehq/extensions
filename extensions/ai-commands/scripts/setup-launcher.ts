import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  privateLauncherDirectory,
  userDataDirectory,
} from "../src/core/launcher-paths";
import {
  OWNER,
  appWrapper,
  readSettings,
  serverWrapper,
  setSetting,
  supportedOriginalLauncher,
} from "./launcher-support";

async function main() {
  const { values } = parseArgs({ options: { launcher: { type: "string" } } });
  const launcher = resolve(
    values.launcher ?? join(homedir(), ".local/bin/vicinae"),
  );
  const dataRoot = privateLauncherDirectory();
  const runtime = join(
    userDataDirectory(),
    "vicinae-ai-commands",
    "launcher-bin",
  );
  const original = join(runtime, "vicinae-original");
  const app = join(runtime, "launch-app");
  const statePath = join(runtime, "setup.json");
  const configHome = process.env.XDG_CONFIG_HOME;
  const settingsPath = join(
    configHome && isAbsolute(configHome)
      ? configHome
      : join(homedir(), ".config"),
    "vicinae",
    "settings.json",
  );
  if (process.platform !== "linux")
    throw new Error("Private desktop entries require Linux.");
  for (const path of [launcher, dataRoot, runtime]) {
    if (/[\r\n:%]/.test(path))
      throw new Error(
        "Launcher paths must not contain newlines, colons, or percent signs.",
      );
  }

  async function readOptional(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  async function atomicWrite(path: string, content: string, mode = 0o700) {
    const temporary = join(dirname(path), `.ai-commands-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, content, { mode, flag: "wx" });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  const currentLauncher = await readFile(launcher, "utf8");
  const stat = await lstat(launcher);
  if (
    !stat.isFile() ||
    !launcher.startsWith(homedir() + "/") ||
    !/^#![^\n]*\b(?:ba|da|z)?sh\b/.test(currentLauncher) ||
    currentLauncher.length > 16_384
  )
    throw new Error(
      "Use --launcher with a small shell wrapper in your home directory. System binaries and symlinks are not modified.",
    );
  const settingsStat = await lstat(settingsPath).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    },
  );
  if (settingsStat && !settingsStat.isFile())
    throw new Error(
      "Linked settings files must be configured in their original location; setup does not replace symlinks.",
    );
  const existingSettings = await readOptional(settingsPath);
  const currentSettings = existingSettings ?? "{}\n";
  const settings = readSettings(currentSettings);
  const previousPrefix =
    settings.providers?.applications?.preferences?.launchPrefix;
  const stored = await readOptional(statePath);
  const state = stored ? JSON.parse(stored) : undefined;
  const prefixSetting = `"${app.replace(/[\\"`$]/g, "\\$&")}"`;
  let prefix: string[];
  if (state) {
    if (
      state.owner !== OWNER ||
      state.launcher !== launcher ||
      state.dataRoot !== dataRoot ||
      !Array.isArray(state.prefix)
    )
      throw new Error(
        "Existing launcher setup belongs to a different installation.",
      );
    const backup = await readFile(original, "utf8");
    if (
      createHash("sha256").update(backup).digest("hex") !== state.originalHash
    )
      throw new Error(
        "The original launcher backup changed. It has not been overwritten.",
      );
    if (
      currentLauncher !== serverWrapper(original, dataRoot) ||
      previousPrefix !== prefixSetting
    )
      throw new Error(
        "Launcher settings changed after setup. Preserve those changes before reconfiguring.",
      );
    prefix = state.prefix;
  } else {
    if (!supportedOriginalLauncher(currentLauncher))
      throw new Error(
        "Setup requires a two-line shell launcher that execs an absolute path or a $HOME path with quoted arguments. Custom wrapper logic is not relocated.",
      );
    if (currentLauncher.includes(OWNER))
      throw new Error(
        "Managed launcher has no setup record. Restore its setup record before continuing.",
      );
    if (previousPrefix)
      throw new Error(
        "A custom Applications Launch Prefix is already configured. It must be preserved when composing the private launcher setup.",
      );
    prefix = [];
    try {
      execFileSync("uwsm", ["check", "is-active"], {
        stdio: "ignore",
        timeout: 2000,
      });
      const candidates = (process.env.PATH ?? "")
        .split(":")
        .filter(isAbsolute)
        .map((dir) => join(dir, "uwsm-app"));
      let found: string | undefined;
      for (const candidate of candidates) {
        try {
          await access(candidate, constants.X_OK);
          found = candidate;
          break;
        } catch {}
      }
      prefix = found ? [found, "--"] : ["uwsm", "app", "--"];
    } catch {
      /* Direct app launching is Vicinae's default outside an active UWSM session. */
    }
  }

  const nextSettings = setSetting(
    currentSettings,
    ["providers", "applications", "preferences", "launchPrefix"],
    prefixSetting,
  );
  if (
    readSettings(nextSettings).providers?.applications?.preferences
      ?.launchPrefix !== prefixSetting
  )
    throw new Error("Could not compose the launcher preference.");
  const previousAppWrapper = await readOptional(app);
  if (state && previousAppWrapper !== appWrapper(dataRoot, prefix))
    throw new Error(
      "The app launcher wrapper changed. It has not been overwritten.",
    );
  for (const path of [app, statePath]) {
    const current = await readOptional(path);
    if (current !== undefined && !state)
      throw new Error(`Unowned setup file exists: ${path}`);
  }
  if (!state && (await readOptional(original)) !== undefined)
    throw new Error("An original-launcher backup already exists.");

  await mkdir(join(dataRoot, "applications"), { recursive: true, mode: 0o700 });
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  await mkdir(dirname(settingsPath), { recursive: true });
  let originalCreated = false;
  let appChanged = false;
  let settingsChanged = false;
  let launcherChanged = false;
  try {
    const backup = join(runtime, `settings-before-setup-${Date.now()}.json`);
    if (!state) {
      await writeFile(original, currentLauncher, { flag: "wx", mode: 0o700 });
      originalCreated = true;
      await writeFile(backup, currentSettings, { flag: "wx", mode: 0o600 });
    }
    await atomicWrite(app, appWrapper(dataRoot, prefix));
    appChanged = true;
    if (
      (await readOptional(settingsPath)) !== existingSettings ||
      (await readFile(launcher, "utf8")) !== currentLauncher
    )
      throw new Error(
        "Launcher or settings changed while setup was running. Retry after completing those edits.",
      );
    await atomicWrite(settingsPath, nextSettings, 0o600);
    settingsChanged = true;
    await atomicWrite(
      launcher,
      serverWrapper(original, dataRoot),
      stat.mode & 0o777,
    );
    launcherChanged = true;
    if (!state) {
      await atomicWrite(
        statePath,
        JSON.stringify(
          {
            owner: OWNER,
            launcher,
            dataRoot,
            prefix,
            settingsPath,
            settingsBackup: backup,
            originalHash: createHash("sha256")
              .update(currentLauncher)
              .digest("hex"),
          },
          null,
          2,
        ) + "\n",
        0o600,
      );
    }
  } catch (error) {
    if (launcherChanged)
      await atomicWrite(launcher, currentLauncher, stat.mode & 0o777);
    if (settingsChanged) {
      if (existingSettings === undefined) await unlink(settingsPath);
      else await atomicWrite(settingsPath, existingSettings, 0o600);
    }
    if (appChanged) {
      if (previousAppWrapper === undefined) await unlink(app);
      else await atomicWrite(app, previousAppWrapper);
    }
    if (originalCreated) await unlink(original);
    throw error;
  }
  console.log(
    "Private launcher configured. Restart Vicinae, then open AI Commands to migrate existing entries.",
  );
  console.log("Launcher data:", dataRoot);
  console.log("Original launcher and settings backup:", runtime);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
