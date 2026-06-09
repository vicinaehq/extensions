import { spawn, execFileSync } from "child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, basename, join, resolve } from "path";
import { homedir } from "os";
import YAML from "yaml";

export type LaunchPane = { cwd?: string; commands?: string[]; title?: string; layout?: LaunchPane; panes?: LaunchPane[]; split_direction?: string };
export type LaunchTab = { title?: string; cwd?: string; commands?: string[]; layout?: LaunchPane };
export type LaunchWindow = { title?: string; cwd?: string; tabs?: LaunchTab[] };
export type LaunchConfig = { name?: string; windows: LaunchWindow[] };
export type Preferences = { ghosttyBinary?: string; workspaceParentDirectory?: string; workspaceScanDepth?: string };
export type LaunchConfigEntry = { name: string; path: string; config: LaunchConfig; error?: undefined } | { name: string; path: string; error: string; config?: undefined };

export const configPath = join(homedir(), ".config", "ghostty", "config");
export const altConfigPath = join(homedir(), ".config", "ghostty", "config.ghostty");
export const launchConfigDir = join(homedir(), ".config", "vicinae", "ghostty-launch-configs");

export function expandHome(path: string): string { return path.replace(/^~(?=$|\/)/, homedir()); }
export function existingConfigPath(): string { return existsSync(configPath) ? configPath : altConfigPath; }
export function ensureLaunchConfigDir(): void { mkdirSync(launchConfigDir, { recursive: true }); }
export function ghosttyBin(preferences?: Preferences): string { return preferences?.ghosttyBinary || "/usr/bin/ghostty"; }
export function defaultWorkspaceRoot(preferences?: Preferences): string { return expandHome(preferences?.workspaceParentDirectory || "~/Developer"); }

export function commandExists(command: string): boolean {
  try { execFileSync("sh", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], { timeout: 2000 }); return true; } catch { return false; }
}

export function spawnGhostty(args: string[], cwd?: string, bin = "/usr/bin/ghostty"): void {
  if (!existsSync(bin) && !commandExists(bin)) throw new Error(`Ghostty binary not found: ${bin}`);
  const child = spawn(bin, args, { cwd: cwd && existsSync(cwd) ? cwd : homedir(), detached: true, stdio: "ignore" });
  child.unref();
}

export function openGhosttyWindow(cwd?: string, bin = "/usr/bin/ghostty", command?: string): void {
  const args: string[] = [];
  if (cwd) args.push(`--working-directory=${cwd}`);
  if (command) args.push(`--initial-command=${command}`);
  spawnGhostty(args, cwd, bin);
}

export function openGhosttyNewWindow(cwd?: string, bin = "/usr/bin/ghostty"): void {
  const args = ["+new-window"];
  if (cwd) args.push(`--working-directory=${cwd}`);
  spawnGhostty(args, cwd, bin);
}

export function findGitRepos(root: string, maxDepth: number): string[] {
  root = expandHome(root || homedir());
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth < 0) return;
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    if (entries.includes(".git")) { out.push(dir); return; }
    for (const name of entries) {
      if (name.startsWith(".") && name !== ".config") continue;
      const p = join(dir, name);
      try { if (lstatSync(p).isDirectory()) walk(p, depth - 1); } catch {}
    }
  }
  walk(root, maxDepth);
  return out.sort((a, b) => basename(a).localeCompare(basename(b)) || a.localeCompare(b));
}

export function listLaunchConfigs(): LaunchConfigEntry[] {
  ensureLaunchConfigDir();
  return readdirSync(launchConfigDir).filter(f => /\.ya?ml$/i.test(f)).map(file => {
    const path = join(launchConfigDir, file);
    try {
      const config = YAML.parse(readFileSync(path, "utf8")) as LaunchConfig;
      if (!config || !Array.isArray(config.windows)) throw new Error("Missing required windows list");
      return { name: config.name || basename(file).replace(/\.ya?ml$/i, ""), path, config };
    } catch (e: any) {
      return { name: basename(file), path, error: e?.message || "Invalid YAML" };
    }
  });
}

export function saveLaunchConfig(name: string, yaml: string): string {
  ensureLaunchConfigDir();
  const safe = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "launch-config";
  const path = join(launchConfigDir, `${safe}.yaml`);
  const parsed = YAML.parse(yaml);
  if (!parsed || !Array.isArray(parsed.windows)) throw new Error("Launch config must include a windows list");
  writeFileSync(path, yaml);
  return path;
}

export function runLaunchConfig(config: LaunchConfig, bin = "/usr/bin/ghostty", cwdOverride?: string): void {
  for (const win of config.windows || []) {
    const tabs = win.tabs && win.tabs.length ? win.tabs : [{ cwd: win.cwd, commands: [] }];
    for (const tab of tabs) {
      const cwd = cwdOverride || tab.cwd || win.cwd || tab.layout?.cwd || homedir();
      const commands = collectCommands(tab);
      openGhosttyWindow(expandHome(cwd), bin, commands.join(" && ") || undefined);
    }
  }
}

export function collectCommands(tab: LaunchTab): string[] {
  const commands: string[] = [];
  if (tab.commands) commands.push(...tab.commands);
  function visit(p?: LaunchPane) {
    if (!p) return;
    if (p.commands) commands.push(...p.commands);
    if (p.layout) visit(p.layout);
    if (p.panes) p.panes.forEach(visit);
  }
  visit(tab.layout);
  return commands;
}

export function readConfig(): string { const p = existingConfigPath(); return existsSync(p) ? readFileSync(p, "utf8") : ""; }
export function writeConfig(text: string): void { const p = existingConfigPath(); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
export function validateGhosttyConfig(bin = "/usr/bin/ghostty"): { ok: boolean; message: string } {
  try { const out = execFileSync(bin, ["+validate-config"], { encoding: "utf8", timeout: 10000 }); return { ok: true, message: out.trim() || "Config is valid" }; }
  catch (e: any) { return { ok: false, message: ((e.stdout || "") + (e.stderr || e.message || "Validation failed")).trim() }; }
}
export function focusWindow(id: string): void { execFileSync("wmctrl", ["-ia", id], { timeout: 3000 }); }
export function listGhosttyWindows(): { id: string; title: string }[] {
  const out = execFileSync("wmctrl", ["-lx"], { encoding: "utf8", timeout: 3000 });
  return out.split(/\n/).filter(l => /ghostty/i.test(l)).map(l => { const parts = l.trim().split(/\s+/); return { id: parts[0], title: parts.slice(4).join(" ") || "Ghostty" }; });
}
export function resolveOpenPath(input?: string): string { const p = expandHome((input || "").trim() || homedir()); try { const st = lstatSync(p); return st.isDirectory() ? resolve(p) : dirname(resolve(p)); } catch { return homedir(); } }
