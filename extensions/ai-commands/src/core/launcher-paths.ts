import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export function userDataDirectory(env = process.env): string {
  const value = env.XDG_DATA_HOME;
  return value && isAbsolute(value)
    ? value
    : join(homedir(), ".local", "share");
}

export function privateLauncherDirectory(env = process.env): string {
  return join(userDataDirectory(env), "vicinae-ai-commands", "launcher-data");
}

export function launcherEnabled(env = process.env): boolean {
  const directory = privateLauncherDirectory(env);
  return (env.XDG_DATA_DIRS ?? "")
    .split(":")
    .some((path) => isAbsolute(path) && resolve(path) === directory);
}

export function withoutPrivateLauncher(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const result = { ...env };
  if (result.XDG_DATA_DIRS !== undefined) {
    const directory = privateLauncherDirectory(env);
    result.XDG_DATA_DIRS =
      result.XDG_DATA_DIRS.split(":")
        .filter(
          (path) => path && (!isAbsolute(path) || resolve(path) !== directory),
        )
        .join(":") || "/usr/local/share:/usr/share";
  }
  return result;
}
