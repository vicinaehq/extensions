import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { safeRealpath } from "../steam/paths";

export type LutrisInstallKind = "native" | "flatpak" | "custom";

export interface LutrisInstall {
  /** Lutris data dir: holds pga.db, coverart/, banners/. */
  dataDir: string;
  /** Where Lutris writes game icons (lutris_<slug>.png). */
  iconDir: string;
  /**
   * Where per-game YAML configs (<configpath>.yml) may live, most likely first. Lutris uses
   * ~/.config/lutris/games if ~/.config/lutris exists, otherwise <data dir>/games.
   */
  gameConfigDirs: string[];
  kind: LutrisInstallKind;
}

/**
 * With a custom data folder we can't tell which install it belongs to, so look for game configs
 * in both usual config dirs too (config file names include a timestamp, so they don't clash).
 */
function overrideConfigDirs(home: string): string[] {
  return [join(home, ".config/lutris/games"), join(home, ".var/app/net.lutris.Lutris/config/lutris/games")];
}

export function isLutrisDataDir(dir: string): boolean {
  return existsSync(join(dir, "pga.db"));
}

/**
 * Lutris installs. Native Lutris uses ~/.local/share/lutris; the Flatpak keeps
 * the same layout under its sandboxed XDG data dir. Icons live in the XDG data
 * dir's hicolor theme (see lutris/settings.py ICON_PATH).
 *
 * A configured data dir replaces detection, like the Steam Folder setting. Only the first
 * install is used by the scan (see scanLutris); the rest are listed so the user can be told.
 */
export function findLutrisInstalls(options: { override?: string; home?: string } = {}): LutrisInstall[] {
  const home = options.home ?? homedir();
  const override = options.override?.trim();
  const candidates: {
    dataDir: string;
    xdgData: string;
    configDir?: string;
    extraConfigDirs?: string[];
    kind: LutrisInstallKind;
  }[] = override
    ? [{ dataDir: override, xdgData: join(override, ".."), kind: "custom", extraConfigDirs: overrideConfigDirs(home) }]
    : [
        {
          dataDir: join(home, ".local/share/lutris"),
          xdgData: join(home, ".local/share"),
          configDir: join(home, ".config/lutris"),
          kind: "native",
        },
        {
          dataDir: join(home, ".var/app/net.lutris.Lutris/data/lutris"),
          xdgData: join(home, ".var/app/net.lutris.Lutris/data"),
          configDir: join(home, ".var/app/net.lutris.Lutris/config/lutris"),
          kind: "flatpak",
        },
      ];
  const seen = new Set<string>();
  const installs: LutrisInstall[] = [];
  for (const c of candidates) {
    if (!isLutrisDataDir(c.dataDir)) continue;
    const real = safeRealpath(c.dataDir);
    if (seen.has(real)) continue;
    seen.add(real);
    installs.push({
      dataDir: real,
      iconDir: join(c.xdgData, "icons/hicolor/128x128/apps"),
      gameConfigDirs: [...(c.configDir ? [join(c.configDir, "games")] : []), ...(c.extraConfigDirs ?? []), join(real, "games")],
      kind: c.kind,
    });
  }
  return installs;
}
