import { Grid, Icon, type Image } from "@vicinae/api";
import { formatBytes, formatLastPlayed, formatPlaytime } from "../lib/format";
import { type Game, type GameArtwork, LAUNCHER_NAMES, launchersOf } from "../lib/games";
import { type HiresArtMap, hiresFor } from "../hooks/use-hires-artwork";
import { pickArtwork, type ViewSettings } from "../lib/view-settings";
import { GameActions } from "./game-actions";

export interface GameViewProps {
  games: Game[];
  hidden: ReadonlySet<string>;
  isLoading: boolean;
  /** Downloaded high-resolution artwork (see hiresFor). */
  hires: HiresArtMap;
  settings: ViewSettings;
  /** Names of the launcher collections a game is in (shown in the details pane). */
  collectionNames: (gameId: string) => string[];
  /** Label games with their launcher (when games come from more than one). */
  showLauncher: boolean;
  onToggleHidden: (game: Game) => void;
  /** Settings section for each game's action panel. */
  settingsActions: React.ReactNode;
  searchBarAccessory: React.ReactNode;
  emptyView: React.ReactNode;
}

function gridContent(game: Game, settings: ViewSettings, hires: GameArtwork | undefined): Image.ImageLike {
  const art = pickArtwork(game, settings.artwork, hires);
  if (!art) return Icon.GameController;
  return { source: art.source, fallback: art.fallback ?? Icon.GameController };
}

/** "Steam", or "Steam + Lutris" for a game installed through both (preferred first). */
export function launcherLabel(game: Game): string {
  return launchersOf(game)
    .map((l) => LAUNCHER_NAMES[l])
    .join(" + ");
}

export function tooltipFor(game: Game, showLauncher: boolean): string {
  const playtime = formatPlaytime(game.playtimeMinutes);
  const size = formatBytes(game.sizeOnDisk);
  return [
    game.title,
    showLauncher ? launcherLabel(game) : undefined,
    formatLastPlayed(game.lastPlayed),
    playtime && `${playtime} on record`,
    size && `${size} on disk`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function GameGrid(props: GameViewProps) {
  const { games, hidden, settings, hires } = props;
  return (
    <Grid
      isLoading={props.isLoading}
      columns={settings.columns}
      aspectRatio={settings.aspectRatio}
      fit={settings.fit === "contain" ? Grid.Fit.Contain : Grid.Fit.Fill}
      inset={settings.fit === "contain" ? Grid.Inset.Medium : Grid.Inset.Zero}
      searchBarPlaceholder="Search games…"
      navigationTitle="Search Games"
      searchBarAccessory={props.searchBarAccessory}
    >
      {games.length === 0 && !props.isLoading
        ? props.emptyView
        : games.map((game) => (
            <Grid.Item
              key={game.id}
              id={game.id}
              title={settings.labels === "none" ? undefined : game.title}
              subtitle={
                settings.labels === "full"
                  ? [props.showLauncher ? launcherLabel(game) : undefined, formatLastPlayed(game.lastPlayed)]
                      .filter(Boolean)
                      .join(" · ")
                  : undefined
              }
              content={{ value: gridContent(game, settings, hiresFor(game, hires)), tooltip: tooltipFor(game, props.showLauncher) }}
              keywords={[game.title, ...game.keywords]}
              actions={
                <GameActions
                  game={game}
                  isHidden={hidden.has(game.id)}
                  onToggleHidden={props.onToggleHidden}
                  settingsActions={props.settingsActions}
                />
              }
            />
          ))}
    </Grid>
  );
}
