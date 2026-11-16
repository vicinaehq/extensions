import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { safeRealpath } from "../steam/paths";

export type HeroicInstallKind = "native" | "flatpak" | "custom";

export interface HeroicInstall {
  /** Heroic's config folder: holds config.json, store/, legendaryConfig/, gog_store/, icons/, images-cache/. */
  configDir: string;
  kind: HeroicInstallKind;
}

export function isHeroicConfigDir(dir: string): boolean {
  return existsSync(join(dir, "config.json")) && existsSync(join(dir, "store"));
}

/**
 * Heroic installs. Native Heroic keeps everything in ~/.config/heroic; the Flatpak uses the same
 * layout under its sandboxed config dir.
 *
 * A configured folder replaces detection, like the other launchers' folder settings. Only the first
 * install is used by the scan (see scanHeroic); the rest are listed so the user can be told.
 */
export function findHeroicInstalls(options: { override?: string; home?: string } = {}): HeroicInstall[] {
  const home = options.home ?? homedir();
  const override = options.override?.trim();
  const candidates: { configDir: string; kind: HeroicInstallKind }[] = override
    ? [{ configDir: override, kind: "custom" }]
    : [
        { configDir: join(home, ".config/heroic"), kind: "native" },
        { configDir: join(home, ".var/app/com.heroicgameslauncher.hgl/config/heroic"), kind: "flatpak" },
      ];
  const seen = new Set<string>();
  const installs: HeroicInstall[] = [];
  for (const c of candidates) {
    if (!isHeroicConfigDir(c.configDir)) continue;
    const real = safeRealpath(c.configDir);
    if (seen.has(real)) continue;
    seen.add(real);
    installs.push({ configDir: real, kind: c.kind });
  }
  return installs;
}
