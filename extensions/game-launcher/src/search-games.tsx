import { ActionPanel, environment, getPreferenceValues, Grid, Icon, List, showToast, Toast } from "@vicinae/api";
import { join } from "node:path";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LauncherPriorityAction, SettingsAction, SettingsActions } from "./components/game-actions";
import { LauncherPriority } from "./components/launcher-priority";
import { GameGrid, type GameViewProps } from "./components/game-grid";
import { GameList } from "./components/game-list";
import { useHiresArtwork } from "./hooks/use-hires-artwork";
import { confirmAndClearArtworkCache } from "./lib/clear-artwork";
import {
  applyFilter,
  collectionNamesFor,
  collectionOptions,
  type GameFilter,
  hiddenGameIds,
  launcherOptions,
  resolveFilter,
} from "./lib/game-views";
import { copiesOf, type Game, type GameSource, LAUNCHER_NAMES, LAUNCHER_PRECEDENCE } from "./lib/games";
import { loadHiddenState, saveHiddenState } from "./lib/hidden";
import { loadPriority, savePriority } from "./lib/launcher-priority";
import { combineLibrary, emptyStateText, type LauncherScans, type LibraryScan, scanLaunchers } from "./lib/library";
import { resolveViewSettings } from "./lib/view-settings";
import { emptyHiddenState, type HiddenState, pruneShown, toggleHidden } from "./lib/visibility";

export default function SearchGames() {
  // Preferences.SearchGames is generated from package.json into vicinae-env.d.ts by `vici`.
  const prefs = getPreferenceValues<Preferences.SearchGames>();
  const settings = useMemo(
    () => resolveViewSettings(prefs),
    [prefs.layout, prefs.artwork, prefs.gridSize, prefs.labels],
  );

  // Raw per-launcher results from disk; merging them into `scan` is cheap and redone in memory.
  const [rawScan, setRawScan] = useState<LauncherScans | undefined>();
  const [hiddenState, setHiddenState] = useState<HiddenState | undefined>();
  // If the saved hidden lists couldn't be loaded, never save: that would overwrite them with an empty list.
  const [hiddenLoadFailed, setHiddenLoadFailed] = useState(false);
  const [filter, setFilter] = useState<GameFilter>("visible");
  const priorityPath = join(environment.supportPath, "launcher-priority.json");
  const [priority, setPriority] = useState<GameSource[]>(() => loadPriority(priorityPath));
  const enabledLaunchers = useMemo(() => {
    const enabled: Record<GameSource, boolean> = {
      steam: prefs.enableSteam !== false,
      lutris: prefs.enableLutris !== false,
      heroic: prefs.enableHeroic !== false,
    };
    return LAUNCHER_PRECEDENCE.filter((l) => enabled[l]);
  }, [prefs.enableSteam, prefs.enableLutris, prefs.enableHeroic]);

  // Vicinae unloads the command when its window closes, so every open starts with a fresh scan
  // (and changing a launcher setting re-runs it). There's no manual refresh: nothing to refresh between opens.
  // Priority and Merge Duplicates only affect merging, so they don't trigger a rescan.
  const runScan = useCallback(() => {
    const result = scanLaunchers({
      enabledLaunchers,
      steamPath: prefs.steamPath,
      includeNonGames: prefs.includeNonGames,
      lutrisPath: prefs.lutrisPath,
      includeStoreClients: prefs.includeStoreClients,
      heroicPath: prefs.heroicPath,
      appInfoCachePath: join(environment.supportPath, "appinfo-cache.json"),
    });
    for (const w of result.launchers.flatMap((l) => l.warnings)) console.warn(w);
    setRawScan(result);
  }, [enabledLaunchers, prefs.steamPath, prefs.includeNonGames, prefs.lutrisPath, prefs.includeStoreClients, prefs.heroicPath]);

  const scan = useMemo<LibraryScan | undefined>(
    () =>
      rawScan
        ? combineLibrary(rawScan, { launcherPriority: priority, hideDuplicates: prefs.hideDuplicates !== false })
        : undefined,
    [rawScan, priority, prefs.hideDuplicates],
  );

  // A bad launcher folder setting is explained by the empty state when nothing was found. When other
  // launchers do have games, the empty state never shows, so say it here instead.
  const settingsProblemKey = scan && scan.games.length > 0 ? scan.settingsProblems.join("\n") : "";
  useEffect(() => {
    if (!settingsProblemKey) return;
    void showToast({
      style: Toast.Style.Failure,
      title: "A launcher folder setting isn't working",
      message: settingsProblemKey,
    });
  }, [settingsProblemKey]);

  const onPriorityChange = useCallback(
    (order: GameSource[]) => {
      setPriority(order); // re-merges in memory; no rescan
      try {
        savePriority(priorityPath, order);
      } catch (err) {
        void showToast({
          style: Toast.Style.Failure,
          title: "Couldn't save launcher priority",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [priorityPath],
  );

  useEffect(() => {
    // Defer so the loading state renders before the synchronous filesystem scan.
    const timer = setTimeout(runScan, 0);
    return () => clearTimeout(timer);
  }, [runScan]);

  // Load hidden games once per open. Reloading on every rescan could race with a save in progress.
  useEffect(() => {
    loadHiddenState().then(
      (state) => {
        setHiddenLoadFailed(false);
        setHiddenState(state);
      },
      (err) => {
        console.warn("Couldn't load hidden games", err);
        setHiddenLoadFailed(true);
        setHiddenState(emptyHiddenState());
      },
    );
  }, []);

  // Forget "show anyway" overrides for games a launcher no longer hides — only for launchers whose
  // hidden list was read completely; a failed read or a disabled launcher would otherwise wipe them.
  useEffect(() => {
    if (!scan || !hiddenState || hiddenLoadFailed) return;
    const pruned = pruneShown(hiddenState, scan.hiddenInLauncher, scan.hiddenListsComplete);
    if (pruned) {
      setHiddenState(pruned);
      // Best effort: if this fails, the same overrides are simply pruned again next time.
      saveHiddenState(pruned).catch((err) => console.warn("Couldn't save hidden games", err));
    }
  }, [scan, hiddenState, hiddenLoadFailed]);

  const onToggleHidden = useCallback(
    async (game: Game) => {
      if (!scan || !hiddenState) return;
      if (hiddenLoadFailed) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Can't change hidden games right now",
          message: "Your hidden games couldn't be loaded. Reopen the command to try again.",
        });
        return;
      }
      const result = toggleHidden(
        copiesOf(game).map((c) => c.id),
        hiddenState,
        scan.hiddenInLauncher,
      );
      setHiddenState(result.state);
      try {
        await saveHiddenState(result.state);
      } catch (err) {
        // Don't show a change that won't survive a reopen.
        setHiddenState(hiddenState);
        await showToast({
          style: Toast.Style.Failure,
          title: `Couldn't ${result.nowHidden ? "hide" : "unhide"} ${game.title}`,
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      await showToast({
        style: Toast.Style.Success,
        title: result.nowHidden ? `Hid ${game.title}` : `Unhid ${game.title}`,
        message: result.stillHiddenInLauncher.length
          ? `Shown here, but still hidden in ${[...new Set(copiesOf(game).filter((c) => result.stillHiddenInLauncher.includes(c.id)).map((c) => LAUNCHER_NAMES[c.source]))].join(" and ")}`
          : undefined,
      });
    },
    [scan, hiddenState, hiddenLoadFailed],
  );

  const hidden = useMemo(
    () => (scan && hiddenState ? hiddenGameIds(scan, hiddenState) : new Set<string>()),
    [scan, hiddenState],
  );
  const collections = useMemo(() => (scan ? collectionOptions(scan, hidden) : []), [scan, hidden]);
  const launchers = useMemo(() => (scan ? launcherOptions(scan, hidden) : []), [scan, hidden]);
  // Launcher filters and badges only make sense once games come from more than one launcher.
  const multiLauncher = launchers.length > 1;
  const activeFilter = resolveFilter(filter, collections, multiLauncher ? launchers : []);
  const games = useMemo(
    () => (scan && hiddenState ? applyFilter(scan, hidden, activeFilter) : []),
    [scan, hiddenState, hidden, activeFilter],
  );
  const collectionNames = useCallback((gameId: string) => (scan ? collectionNamesFor(scan, gameId) : []), [scan]);

  const artworkSource = prefs.downloadArtwork === false ? "local" : "hires";
  const { art: hires, usage, clearCache } = useHiresArtwork(scan, settings, artworkSource);
  const onClearCache = useCallback(() => {
    void confirmAndClearArtworkCache(usage(), clearCache, { redownload: artworkSource === "hires" });
  }, [usage, clearCache, artworkSource]);

  const isLoading = !scan || !hiddenState;
  const isGrid = settings.layout === "grid";
  // Grid and List expose identically-shaped Dropdown/EmptyView components, but each view must use its own.
  const Dropdown = isGrid ? Grid.Dropdown : List.Dropdown;
  const EmptyView = isGrid ? Grid.EmptyView : List.EmptyView;

  const empty = (() => {
    if (activeFilter === "hidden") {
      return { title: "No hidden games", description: "Games hidden here or in their launcher show up in this list." };
    }
    if (activeFilter.startsWith("launcher:")) {
      const name = LAUNCHER_NAMES[activeFilter.slice("launcher:".length) as GameSource];
      return { title: `No ${name} games`, description: `No visible games are installed through ${name}.` };
    }
    if (activeFilter.startsWith("collection:")) {
      return { title: "No games in this collection", description: "None of this collection's games are installed." };
    }
    return scan ? emptyStateText(scan) : undefined;
  })();

  // Reachable from every game's actions and from the empty state (e.g. when every game is hidden).
  const priorityView =
    enabledLaunchers.length > 1 ? (
      <LauncherPriority
        initial={priority}
        enabled={enabledLaunchers}
        duplicatesMerged={prefs.hideDuplicates !== false}
        onChange={onPriorityChange}
      />
    ) : undefined;

  const viewProps: GameViewProps = {
    games,
    hidden,
    isLoading,
    hires,
    settings,
    collectionNames,
    showLauncher: multiLauncher,
    onToggleHidden,
    settingsActions: <SettingsActions onClearCache={onClearCache} priorityView={priorityView} />,
    searchBarAccessory: (
      <Dropdown tooltip="Show" value={activeFilter} onChange={(v) => setFilter(v as GameFilter)}>
        <Dropdown.Item title="Installed Games" value="visible" icon={Icon.GameController} />
        {multiLauncher &&
          launchers.map((o) => (
            <Dropdown.Item
              key={o.value}
              title={`${LAUNCHER_NAMES[o.launcher]} Games (${o.count})`}
              value={o.value}
              icon={Icon.AppWindow}
            />
          ))}
        <Dropdown.Item title={`Hidden Games (${hidden.size})`} value="hidden" icon={Icon.EyeDisabled} />
        {priority.map((launcher) => {
          const own = collections.filter((o) => o.collection.source === launcher);
          return own.length === 0 ? null : (
            <Dropdown.Section key={launcher} title={LAUNCHER_NAMES[launcher]}>
              {own.map((o) => (
                <Dropdown.Item
                  key={o.value}
                  title={`${o.collection.name} (${o.count})`}
                  value={o.value}
                  icon={o.collection.kind === "favorites" ? Icon.Star : Icon.Folder}
                />
              ))}
            </Dropdown.Section>
          );
        })}
      </Dropdown>
    ),
    emptyView: (
      <EmptyView
        icon={Icon.GameController}
        title={empty?.title}
        description={empty?.description}
        actions={
          <ActionPanel>
            <SettingsAction />
            <LauncherPriorityAction view={priorityView} />
          </ActionPanel>
        }
      />
    ),
  };

  return isGrid ? (
    <GameGrid {...viewProps} />
  ) : (
    <GameList {...viewProps} initialShowDetail={settings.layout === "list-detail"} />
  );
}
