import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
import * as fileSystem from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { privateLauncherDirectory, launcherEnabled } from "./launcher-paths";
import {
  OWNER,
  appWrapper,
  readSettings,
  serverWrapper,
  setSetting,
  supportedOriginalLauncher,
} from "./launcher-support";

export interface SetupOptions {
  launcher?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
}

export type SetupFileSystem = Pick<
  typeof fileSystem,
  | "access"
  | "lstat"
  | "mkdir"
  | "readFile"
  | "rename"
  | "link"
  | "unlink"
  | "writeFile"
>;

async function readPlan(options: SetupOptions, io: SetupFileSystem) {
  const home = options.home ?? homedir();
  const env = { ...process.env, ...options.env };
  const dataHome =
    env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME)
      ? env.XDG_DATA_HOME
      : join(home, ".local/share");
  env.XDG_DATA_HOME = dataHome;
  const launcher = resolve(
    options.launcher ?? join(home, ".local/bin/vicinae"),
  );
  const dataRoot = privateLauncherDirectory(env);
  const runtime = join(dataHome, "vicinae-ai-commands", "launcher-bin");
  const original = join(runtime, "vicinae-original");
  const app = join(runtime, "launch-app");
  const statePath = join(runtime, "setup.json");
  const configHome = env.XDG_CONFIG_HOME;
  const settingsPath = join(
    configHome && isAbsolute(configHome) ? configHome : join(home, ".config"),
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
      const info = await io.lstat(path);
      if (!info.isFile())
        throw new Error(`Setup cannot replace a symlink or directory: ${path}`);
      return await io.readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  async function atomicWrite(
    path: string,
    content: string,
    mode = 0o700,
    exclusive = false,
  ) {
    const temporary = join(dirname(path), `.ai-commands-${randomUUID()}.tmp`);
    try {
      await io.writeFile(temporary, content, { mode, flag: "wx" });
      if (exclusive) await io.link(temporary, path);
      else await io.rename(temporary, path);
    } finally {
      await io.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  for (const directory of [
    join(dataRoot, "applications"),
    dirname(launcher),
    dirname(settingsPath),
    runtime,
    dataRoot,
  ]) {
    let parent = directory;
    while (parent !== dirname(parent)) {
      try {
        const info = await io.lstat(parent);
        if (!info.isDirectory())
          throw new Error(
            `Setup requires ordinary directories, not linked paths: ${parent}`,
          );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      parent = dirname(parent);
    }
  }
  const launcherStat = await io
    .lstat(launcher)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
  if (launcherStat && (!launcherStat.isFile() || launcherStat.size > 16384))
    throw new Error(
      "Automatic setup requires a small user-owned shell launcher. Binaries and symlinks are not supported.",
    );
  const currentLauncher = await readOptional(launcher);
  if (currentLauncher === undefined)
    throw new Error(
      "No supported Vicinae launcher was found. Automatic setup currently needs a user-owned shell launcher, such as the Omarchy installation.",
    );
  const stat = await io.lstat(launcher);
  if (
    !stat.isFile() ||
    !launcher.startsWith(home + "/") ||
    !/^#![^\n]*\b(?:ba|da|z)?sh\b/.test(currentLauncher) ||
    currentLauncher.length > 16_384
  )
    throw new Error(
      "This installation needs a user-owned shell launcher. Packaged binaries, symlinks, and custom launch scripts are not supported by automatic setup.",
    );
  const settingsStat = await io
    .lstat(settingsPath)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
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
  let originalLauncher = currentLauncher;
  let baseSettings = currentSettings;
  if (state) {
    if (
      state.owner !== OWNER ||
      state.launcher !== launcher ||
      state.dataRoot !== dataRoot ||
      state.settingsPath !== settingsPath ||
      !Array.isArray(state.prefix) ||
      state.prefix.some((part: unknown) => typeof part !== "string")
    )
      throw new Error(
        "Existing launcher setup belongs to a different installation.",
      );
    const backup =
      (await readOptional(original)) ??
      (state.pending === true ? state.launcherContents : undefined);
    if (typeof backup !== "string" || !backup)
      throw new Error("The original launcher backup is missing.");
    if (
      createHash("sha256").update(backup).digest("hex") !== state.originalHash
    )
      throw new Error(
        "The original launcher backup changed. It has not been overwritten.",
      );
    originalLauncher = backup;
    if (state.pending === true) {
      if (
        typeof state.settingsBackup !== "string" ||
        dirname(state.settingsBackup) !== runtime ||
        !/settings-before-setup-[\da-f-]+\.json$/.test(state.settingsBackup) ||
        typeof state.settingsExisted !== "boolean"
      )
        throw new Error(
          "The pending setup record is invalid. Its files have not been changed.",
        );
      const savedSettings =
        (await readOptional(state.settingsBackup)) ?? state.settingsContents;
      if (
        typeof savedSettings !== "string" ||
        createHash("sha256").update(savedSettings).digest("hex") !==
          state.settingsHash
      )
        throw new Error(
          "The pending settings backup changed. Its files have not been changed.",
        );
      baseSettings = savedSettings;
      const managedSettings = setSetting(
        savedSettings,
        ["providers", "applications", "preferences", "launchPrefix"],
        prefixSetting,
      );
      if (
        currentLauncher !== backup &&
        currentLauncher !== serverWrapper(original, dataRoot)
      )
        throw new Error(
          "The launcher changed since setup was interrupted. Its changes have been preserved.",
        );
      if (
        existingSettings !==
          (state.settingsExisted ? savedSettings : undefined) &&
        existingSettings !== managedSettings
      )
        throw new Error(
          "Settings changed since setup was interrupted. Their changes have been preserved.",
        );
    } else if (
      currentLauncher !== serverWrapper(original, dataRoot) ||
      previousPrefix !== prefixSetting
    ) {
      throw new Error(
        "Launcher settings changed after setup. Preserve those changes before reconfiguring.",
      );
    }
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
      await execute("uwsm", ["check", "is-active"], { env, timeout: 2000 });
      const candidates = (env.PATH ?? "")
        .split(":")
        .filter(isAbsolute)
        .map((dir) => join(dir, "uwsm-app"));
      let found: string | undefined;
      for (const candidate of candidates) {
        try {
          await io.access(candidate, constants.X_OK);
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
    baseSettings,
    ["providers", "applications", "preferences", "launchPrefix"],
    prefixSetting,
  );
  if (
    readSettings(nextSettings).providers?.applications?.preferences
      ?.launchPrefix !== prefixSetting
  )
    throw new Error("Could not compose the launcher preference.");
  const previousAppWrapper = await readOptional(app);
  if (
    state &&
    previousAppWrapper !== appWrapper(dataRoot, prefix) &&
    !(state.pending === true && previousAppWrapper === undefined)
  )
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

  return {
    launcher,
    dataRoot,
    runtime,
    original,
    app,
    statePath,
    settingsPath,
    state,
    currentLauncher,
    originalLauncher,
    stat,
    currentSettings,
    existingSettings,
    prefix,
    nextSettings,
    previousAppWrapper,
    readOptional,
    atomicWrite,
    enabled: launcherEnabled(env),
  };
}

export async function inspectLauncherSetup(
  options: SetupOptions = {},
  io: SetupFileSystem = fileSystem,
) {
  const plan = await readPlan(options, io);
  return {
    status:
      plan.state?.pending === true
        ? "incomplete"
        : plan.state
          ? plan.enabled
            ? "enabled"
            : "restart"
          : "available",
    launcher: plan.launcher,
    settingsPath: plan.settingsPath,
    dataRoot: plan.dataRoot,
    backupDirectory: plan.runtime,
  } as const;
}

export async function configureLauncher(
  options: SetupOptions = {},
  io: SetupFileSystem = fileSystem,
) {
  const plan = await readPlan(options, io);
  if (plan.state && plan.state.pending !== true)
    return inspectLauncherSetup(options, io);
  const {
    launcher,
    dataRoot,
    runtime,
    original,
    app,
    statePath,
    settingsPath,
    state,
    currentLauncher,
    originalLauncher,
    stat,
    currentSettings,
    existingSettings,
    prefix,
    nextSettings,
    previousAppWrapper,
    readOptional,
    atomicWrite,
  } = plan;
  await io.mkdir(join(dataRoot, "applications"), {
    recursive: true,
    mode: 0o700,
  });
  await io.mkdir(runtime, { recursive: true, mode: 0o700 });
  await io.mkdir(dirname(settingsPath), { recursive: true });
  let originalCreated = false;
  let appChanged = false;
  let settingsChanged = false;
  let launcherChanged = false;
  let pendingWritten = Boolean(state?.pending);
  try {
    const backup =
      state?.settingsBackup ??
      join(runtime, `settings-before-setup-${Date.now()}-${randomUUID()}.json`);
    const record = state ?? {
      owner: OWNER,
      launcher,
      dataRoot,
      prefix,
      settingsPath,
      settingsBackup: backup,
      settingsExisted: existingSettings !== undefined,
      settingsHash: createHash("sha256").update(currentSettings).digest("hex"),
      originalHash: createHash("sha256").update(originalLauncher).digest("hex"),
      launcherContents: originalLauncher,
      settingsContents: currentSettings,
    };
    if (!pendingWritten) {
      await atomicWrite(
        statePath,
        JSON.stringify({ ...record, pending: true }, null, 2) + "\n",
        0o600,
        true,
      );
      pendingWritten = true;
    }
    if ((await readOptional(original)) === undefined) {
      await atomicWrite(original, originalLauncher, 0o700, true);
      originalCreated = true;
    }
    if ((await readOptional(backup)) === undefined) {
      await atomicWrite(backup, record.settingsContents, 0o600, true);
    }
    await atomicWrite(app, appWrapper(dataRoot, prefix));
    appChanged = true;
    if (
      (await readOptional(settingsPath)) !== existingSettings ||
      (await io.readFile(launcher, "utf8")) !== currentLauncher
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
    const { launcherContents, settingsContents, ...completedRecord } = record;
    await atomicWrite(
      statePath,
      JSON.stringify({ ...completedRecord, pending: false }, null, 2) + "\n",
      0o600,
    );
  } catch (error) {
    const failures: unknown[] = [];
    if (launcherChanged) {
      try {
        await atomicWrite(launcher, currentLauncher, stat.mode & 0o777);
      } catch (failure) {
        failures.push(failure);
      }
    }
    let settingsRestored = !settingsChanged;
    if (settingsChanged) {
      try {
        if (existingSettings === undefined) await io.unlink(settingsPath);
        else await atomicWrite(settingsPath, existingSettings, 0o600);
        settingsRestored = true;
      } catch (failure) {
        failures.push(failure);
      }
    }
    // A surviving launchPrefix still needs its executable, even on failed rollback.
    if (appChanged && settingsRestored) {
      try {
        if (previousAppWrapper === undefined) await io.unlink(app);
        else await atomicWrite(app, previousAppWrapper);
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (originalCreated && !pendingWritten) {
      try {
        await io.unlink(original);
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length)
      throw new Error(
        `Setup failed and could not fully restore the previous configuration. Reopen Setup AI Commands to resume. Backups are in ${runtime}.`,
        { cause: error },
      );
    throw error;
  }
  return inspectLauncherSetup(options, io);
}
