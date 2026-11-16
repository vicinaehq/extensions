import { Action, Icon, type Image, List } from "@vicinae/api";
import { useState } from "react";
import { formatBytes, formatLastPlayed, formatPlaytime, markdownUrl } from "../lib/format";
import { type Game, type GameArtwork, LAUNCHER_NAMES, launchersOf } from "../lib/games";
import { hiresFor } from "../hooks/use-hires-artwork";
import { launcherDetails } from "../lib/store-info";
import { pickArtwork, pickListIcon } from "../lib/view-settings";
import { GameActions } from "./game-actions";
import type { GameViewProps } from "./game-grid";

/** Markdown image for a local path or URL, sized for the detail pane. */
function markdownImage(source: string, alt: string): string {
  return `![${alt.replace(/[[\]]/g, "")}](${markdownUrl(source)}?raycast-width=460)`;
}

function listIcon(game: Game, hires: GameArtwork | undefined): Image.ImageLike {
  const icon = pickListIcon(game, hires);
  return icon ? { source: icon.source, fallback: icon.fallback ?? Icon.GameController } : Icon.GameController;
}

function GameDetail(props: { game: Game; hires: GameArtwork | undefined; collections: string[] }) {
  const { game, hires, collections } = props;
  const art = pickArtwork(game, "banner", hires);
  const details = launcherDetails(game);
  // A merged entry's details may come from a copy other than the one Enter opens: then say whose they are.
  const from = details.source && details.source !== game.source ? ` (${LAUNCHER_NAMES[details.source]})` : "";
  const playtime = formatPlaytime(game.playtimeMinutes);
  const size = formatBytes(game.sizeOnDisk);
  return (
    <List.Item.Detail
      markdown={art ? markdownImage(art.source, game.title) : `# ${game.title}`}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Title" text={game.title} />
          <List.Item.Detail.Metadata.Label title="Last Played" text={formatLastPlayed(game.lastPlayed).replace(/^Played /, "")} />
          {playtime && <List.Item.Detail.Metadata.Label title="Playtime" text={playtime} />}
          {size && <List.Item.Detail.Metadata.Label title="Size on Disk" text={size} />}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Launcher" text={LAUNCHER_NAMES[game.source]} />
          {game.alternates?.length ? (
            <List.Item.Detail.Metadata.Label
              title="Also installed in"
              text={game.alternates.map((a) => LAUNCHER_NAMES[a.source]).join(", ")}
            />
          ) : null}
          {details.store && <List.Item.Detail.Metadata.Label title={`Store${from}`} text={details.store} />}
          {details.runner && <List.Item.Detail.Metadata.Label title={`Runner${from}`} text={details.runner} />}
          {details.platform && <List.Item.Detail.Metadata.Label title={`Platform${from}`} text={details.platform} />}
          {collections.length > 0 && <List.Item.Detail.Metadata.Label title="Collections" text={collections.join(", ")} />}
          {game.steam && <List.Item.Detail.Metadata.Label title="App ID" text={String(game.steam.appid)} />}
          {game.installDir && <List.Item.Detail.Metadata.Label title="Install Folder" text={game.installDir} />}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export function GameList(props: GameViewProps & { initialShowDetail: boolean }) {
  const { games, hidden, hires } = props;
  const [showDetail, setShowDetail] = useState(props.initialShowDetail);

  const toggleDetail = (
    <Action
      title={showDetail ? "Hide Details" : "Show Details"}
      icon={Icon.AppWindowSidebarRight}
      shortcut={{ modifiers: ["ctrl"], key: "d" }}
      onAction={() => setShowDetail((v) => !v)}
    />
  );

  return (
    <List
      isLoading={props.isLoading}
      isShowingDetail={showDetail && games.length > 0}
      searchBarPlaceholder="Search games…"
      navigationTitle="Search Games"
      searchBarAccessory={props.searchBarAccessory}
    >
      {games.length === 0 && !props.isLoading
        ? props.emptyView
        : games.map((game) => {
            const playtime = formatPlaytime(game.playtimeMinutes);
            return (
              <List.Item
                key={game.id}
                id={game.id}
                title={game.title}
                icon={listIcon(game, hiresFor(game, hires))}
                keywords={game.keywords}
                accessories={
                  showDetail
                    ? undefined
                    : [
                        ...(props.showLauncher
                          ? launchersOf(game).map((l, i) => ({
                              tag: LAUNCHER_NAMES[l],
                              tooltip: i === 0 ? "Opens with this launcher" : "Also installed here",
                            }))
                          : []),
                        ...(playtime ? [{ text: playtime, icon: Icon.Hourglass, tooltip: "Playtime" }] : []),
                        { text: formatLastPlayed(game.lastPlayed).replace(/^Played /, ""), icon: Icon.Clock, tooltip: "Last played" },
                      ]
                }
                detail={showDetail ? <GameDetail game={game} hires={hiresFor(game, hires)} collections={props.collectionNames(game.id)} /> : undefined}
                actions={
                  <GameActions
                    game={game}
                    isHidden={hidden.has(game.id)}
                    onToggleHidden={props.onToggleHidden}
                    settingsActions={props.settingsActions}
                    layoutActions={toggleDetail}
                  />
                }
              />
            );
          })}
    </List>
  );
}
