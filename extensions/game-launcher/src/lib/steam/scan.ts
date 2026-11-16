/** The Steam launcher integration: every Steam install on the system, merged. */
import type { Game, GameCollection, LauncherScan } from "../games";
import { AppInfoStore } from "./appinfo-store";
import { scanSteamInstall } from "./library";
import { findSteamInstalls } from "./paths";

export interface SteamScanOptions {
  /** Steam Folder preference: when set, only this install is used. */
  steamPath?: string;
  includeTools?: boolean;
  /** Where to persist appinfo.vdf lookups between runs. Without it, appinfo.vdf is read on every scan. */
  appInfoCachePath?: string;
  /** Home directory to auto-detect installs in (tests). */
  home?: string;
}

export interface SteamLauncherScan extends LauncherScan {
  launcher: "steam";
  /** Every Steam app on disk (tools and apps mid-update included), for pruning Steam-keyed caches. */
  installedAppids: Set<number>;
}

/**
 * Scan Steam. Only one install is used (the Steam Folder setting, else the first found: native,
 * then Flatpak, then Snap); other installs are noted. Supporting several at once would mean
 * reconciling duplicate app ids, play data and steam:// handlers across them.
 */
export function scanSteam(options: SteamScanOptions = {}): SteamLauncherScan {
  const warnings: string[] = [];
  const sources: string[] = [];
  const byId = new Map<string, Game>();
  const installedAppids = new Set<number>();
  const collections = new Map<string, GameCollection>();
  const hiddenInLauncher = new Set<string>();
  let hiddenListComplete = true;
  let complete = true;

  const appInfo = options.appInfoCachePath ? AppInfoStore.load(options.appInfoCachePath) : AppInfoStore.memory();
  const [first, ...others] = findSteamInstalls({ override: options.steamPath, home: options.home });
  const installs = first ? [first] : [];
  for (const other of others) {
    warnings.push(
      `Also found Steam (${other.kind}) at ${other.root}; only the ${first!.kind} install is used. ` +
        "Set the Steam Folder setting to use a different one.",
    );
  }
  // With nothing found we can't tell "no games" from "wrong path", so never treat the result as authoritative.
  if (installs.length === 0) complete = false;
  const settingsProblem =
    options.steamPath?.trim() && installs.length === 0
      ? `The Steam Folder setting doesn't point at a Steam install (no steamapps folder): ${options.steamPath.trim()}`
      : undefined;

  for (const install of installs) {
    sources.push(`Steam (${install.kind}): ${install.root}`);
    try {
      const result = scanSteamInstall(install, { includeTools: options.includeTools, appInfo });
      warnings.push(...result.warnings);
      complete &&= result.complete;
      hiddenListComplete &&= result.collectionsComplete;
      for (const id of result.installedAppids) installedAppids.add(id);
      for (const g of result.games) if (!byId.has(g.id)) byId.set(g.id, g);
      for (const id of result.hiddenInLauncher) hiddenInLauncher.add(id);
      for (const c of result.collections) {
        const prev = collections.get(c.id);
        collections.set(c.id, prev ? { ...prev, gameIds: new Set([...prev.gameIds, ...c.gameIds]) } : c);
      }
    } catch (err) {
      complete = false;
      warnings.push(`Failed to scan Steam at ${install.root}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Only forget uninstalled apps when we know the full picture (not with an unmounted library drive).
  if (complete) appInfo.retain(installedAppids);
  appInfo.save();

  return {
    launcher: "steam",
    found: installs.length > 0,
    sources,
    games: [...byId.values()],
    // Favorites first, then user collections in the order the install scan sorted them.
    collections: [...collections.values()].sort((a, b) => Number(b.kind === "favorites") - Number(a.kind === "favorites")),
    hiddenInLauncher,
    hiddenListComplete: complete && hiddenListComplete,
    complete,
    warnings,
    settingsProblem,
    installedAppids,
  };
}
