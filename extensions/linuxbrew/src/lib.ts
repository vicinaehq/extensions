import { execFile, execFileSync } from "child_process";
import { existsSync } from "fs";

export type Preferences = { customBrewPath?: string; includeCasks?: boolean; greedyUpgrades?: boolean; cleanupAll?: boolean };
export type BrewKind = "formula" | "cask" | "unknown";
export type BrewItem = { name: string; fullName?: string; kind: BrewKind; desc?: string; version?: string; installed?: boolean; outdated?: boolean; homepage?: string };

const LINUXBREW_PATH = "/home/linuxbrew/.linuxbrew/bin/brew";

export function brewBin(preferences?: Preferences): string {
  const custom = preferences?.customBrewPath?.trim();
  if (custom) return custom;
  if (existsSync(LINUXBREW_PATH)) return LINUXBREW_PATH;
  return "brew";
}

export function friendlyBrewError(error: unknown, preferences?: Preferences): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|not found|no such file/i.test(message)) {
    return new Error(`Linuxbrew was not found. Install Homebrew for Linux or set the Custom Brew Executable Path preference to your brew binary. Tried: ${brewBin(preferences)}`);
  }
  return new Error(message);
}

export function runBrew(args: string[], preferences?: Preferences): string {
  try {
    return execFileSync(brewBin(preferences), args, { encoding: "utf8", timeout: 60000, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    throw friendlyBrewError(error, preferences);
  }
}

export function runBrewAsync(args: string[], preferences?: Preferences): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(brewBin(preferences), args, { encoding: "utf8", timeout: 60000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(friendlyBrewError(new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`), preferences));
      else resolve(stdout);
    });
  });
}

export function runBrewJson<T>(args: string[], preferences?: Preferences): T {
  const text = runBrew(args, preferences).trim();
  return (text ? JSON.parse(text) : null) as T;
}

export async function runBrewJsonAsync<T>(args: string[], preferences?: Preferences): Promise<T> {
  const text = (await runBrewAsync(args, preferences)).trim();
  return (text ? JSON.parse(text) : null) as T;
}

export function terminalCommand(args: string[], preferences?: Preferences): string {
  return [brewBin(preferences), ...args].map(shellQuote).join(" ");
}

export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function parseLines(text: string): string[] { return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean); }

export function parseSearchOutput(text: string): BrewItem[] {
  return parseLines(text).map((line) => ({ name: line.replace(/^homebrew\/(?:core|cask)\//, ""), fullName: line, kind: line.includes("/cask/") ? "cask" : "unknown" }));
}

export function searchArgs(query: string, preferences?: Preferences): string[] {
  const args = ["search"];
  if (preferences?.includeCasks === false) args.push("--formulae");
  else args.push("--casks", "--formulae");
  args.push(query.trim());
  return args;
}

export function searchPackages(query: string, preferences?: Preferences): BrewItem[] {
  const q = query.trim();
  return q ? parseSearchOutput(runBrew(searchArgs(q, preferences), preferences)) : [];
}

export async function searchPackagesAsync(query: string, preferences?: Preferences): Promise<BrewItem[]> {
  const q = query.trim();
  return q ? parseSearchOutput(await runBrewAsync(searchArgs(q, preferences), preferences)) : [];
}

export function listInstalled(preferences?: Preferences): BrewItem[] {
  return normalizeInfo(runBrewJson<{ formulae?: any[]; casks?: any[] }>(["info", "--json=v2", "--installed"], preferences));
}

export async function listInstalledAsync(preferences?: Preferences): Promise<BrewItem[]> {
  return normalizeInfo(await runBrewJsonAsync<{ formulae?: any[]; casks?: any[] }>(["info", "--json=v2", "--installed"], preferences));
}

export function listOutdated(preferences?: Preferences): BrewItem[] {
  const args = ["outdated", "--json=v2"];
  if (preferences?.greedyUpgrades) args.push("--greedy");
  return normalizeInfo(runBrewJson<{ formulae?: any[]; casks?: any[] }>(args, preferences)).map((i) => ({ ...i, outdated: true }));
}

export async function listOutdatedAsync(preferences?: Preferences): Promise<BrewItem[]> {
  const args = ["outdated", "--json=v2"];
  if (preferences?.greedyUpgrades) args.push("--greedy");
  return normalizeInfo(await runBrewJsonAsync<{ formulae?: any[]; casks?: any[] }>(args, preferences)).map((i) => ({ ...i, outdated: true }));
}

export async function getInfo(name: string, preferences?: Preferences): Promise<BrewItem | undefined> {
  return normalizeInfo(await runBrewJsonAsync<{ formulae?: any[]; casks?: any[] }>(["info", "--json=v2", name], preferences))[0];
}

export function normalizeInfo(json: { formulae?: any[]; casks?: any[] } | null): BrewItem[] {
  const formulae = (json?.formulae || []).map((f) => ({
    name: f.name,
    fullName: f.full_name || f.name,
    kind: "formula" as const,
    desc: f.desc,
    version: f.versions?.stable || f.current_version || f.installed_versions?.join(", ") || f.installed?.[0]?.version,
    installed: Array.isArray(f.installed) ? f.installed.length > 0 : Array.isArray(f.installed_versions) && f.installed_versions.length > 0,
    homepage: f.homepage,
  }));
  const casks = (json?.casks || []).map((c) => ({
    name: c.token || c.name?.[0],
    fullName: c.token || c.name?.[0],
    kind: "cask" as const,
    desc: c.desc,
    version: c.version || c.current_version || c.installed_versions?.join(", "),
    installed: Boolean(c.installed) || (Array.isArray(c.installed_versions) && c.installed_versions.length > 0),
    homepage: c.homepage,
  }));
  return [...formulae, ...casks].filter((i) => i.name).sort((a, b) => a.name.localeCompare(b.name));
}

export function cleanupArgs(preferences?: Preferences): string[] { return preferences?.cleanupAll ? ["cleanup", "--prune=all"] : ["cleanup"]; }
export function upgradeArgs(name?: string, preferences?: Preferences): string[] { const args = ["upgrade"]; if (preferences?.greedyUpgrades) args.push("--greedy"); if (name) args.push(name); return args; }
