import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SteamInstallKind = "native" | "flatpak" | "snap" | "custom";

export interface SteamInstall {
  /** Steam root: the directory containing steamapps/, appcache/, userdata/, config/. */
  root: string;
  kind: SteamInstallKind;
}

/** Candidate Steam roots, in priority order. */
export function candidateSteamRoots(home = homedir()): { path: string; kind: SteamInstallKind }[] {
  return [
    { path: join(home, ".local/share/Steam"), kind: "native" },
    { path: join(home, ".steam/steam"), kind: "native" },
    { path: join(home, ".steam/root"), kind: "native" },
    { path: join(home, ".steam/debian-installation"), kind: "native" },
    { path: join(home, ".var/app/com.valvesoftware.Steam/.local/share/Steam"), kind: "flatpak" },
    { path: join(home, ".var/app/com.valvesoftware.Steam/data/Steam"), kind: "flatpak" },
    { path: join(home, "snap/steam/common/.local/share/Steam"), kind: "snap" },
  ];
}

export function isSteamRoot(path: string): boolean {
  return existsSync(join(path, "steamapps")) || existsSync(join(path, "config/libraryfolders.vdf"));
}

/** realpath, or the path unchanged if it can't be resolved (e.g. it doesn't exist). */
export function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Find every distinct Steam installation on the system. `~/.steam/steam` is
 * usually a symlink to `~/.local/share/Steam`, so roots are de-duplicated by
 * their resolved path.
 *
 * A configured override replaces detection entirely: only that folder is
 * used, and if it isn't a Steam install, nothing is found.
 */
export function findSteamInstalls(options: { override?: string; home?: string } = {}): SteamInstall[] {
  const override = options.override?.trim();
  const candidates: { path: string; kind: SteamInstallKind }[] = override
    ? [{ path: override, kind: "custom" }]
    : candidateSteamRoots(options.home);

  const seen = new Set<string>();
  const installs: SteamInstall[] = [];
  for (const c of candidates) {
    if (!isSteamRoot(c.path)) continue;
    const real = safeRealpath(c.path);
    if (seen.has(real)) continue;
    seen.add(real);
    installs.push({ root: real, kind: c.kind });
  }
  return installs;
}
