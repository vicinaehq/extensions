import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Action,
  ActionPanel,
  Color,
  closeMainWindow,
  Detail,
  Icon,
  Keyboard,
  List,
  open,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  useCallback,
  useDeferredValue,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  fetchFeaturedGames,
  fetchGameDetails,
  fetchImageAsDataUri,
  fetchProtonDBRating,
  imagePersister,
  PERSIST_MAX_AGE,
  persister,
  queryClient,
  searchSteamGames,
} from "./api";
import type {
  SteamGame,
  SteamGenre,
  ProtonDBRating,
  SteamAppDetails,
} from "./types";
import {
  formatScore,
  formatRequirementsSection,
  formatTierName,
  getScoreColor,
  getTierColor,
} from "./utils/formatters";

function GameActions({
  game,
  rating,
  showDetailsAction,
}: {
  game: SteamGame;
  rating: ProtonDBRating | null;
  showDetailsAction?: ReactNode;
}) {
  async function openExternal(target: string, title: string) {
    await open(target);
    await showToast({
      style: Toast.Style.Success,
      title,
      message: game.name,
    });
    await closeMainWindow();
  }

  return (
    <ActionPanel>
      {showDetailsAction}
      <Action
        title="Open on ProtonDB"
        onAction={() =>
          openExternal(
            `https://www.protondb.com/app/${game.appid}`,
            "Opening on ProtonDB",
          )
        }
        icon={Icon.Globe01}
        shortcut={Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common}
      />
      <Action
        title="Open on Steam"
        onAction={() =>
          openExternal(
            `https://store.steampowered.com/app/${game.appid}`,
            "Opening on Steam",
          )
        }
        icon={Icon.Store}
        shortcut={Keyboard.Shortcut.Common.OpenWith as Keyboard.Shortcut.Common}
      />
      <Action
        title="Open in Steam"
        onAction={() =>
          openExternal(`steam://store/${game.appid}`, "Opening in Steam app")
        }
        icon={Icon.AppWindow}
        shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
      />
      <ActionPanel.Section>
        <Action.CopyToClipboard
          title="Copy ProtonDB URL"
          content={`https://www.protondb.com/app/${game.appid}`}
          shortcut={Keyboard.Shortcut.Common.Copy as Keyboard.Shortcut.Common}
        />
        {rating && (
          <Action.CopyToClipboard
            title="Copy Compatibility Info"
            content={`${game.name}: ${formatTierName(rating.tier)} (${rating.total} reports, ${rating.confidence} confidence)`}
            shortcut={Keyboard.Shortcut.Common.CopyName as Keyboard.Shortcut.Common}
          />
        )}
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function GameDetail({ game }: { game: SteamGame }) {
  const { data: rating, isLoading: loadingRating } =
    useQuery<ProtonDBRating | null>({
      queryKey: ["protondb-rating", game.appid],
      queryFn: () => fetchProtonDBRating(game.appid),
    });

  const { data: gameDetails, isLoading: loadingDetails } =
    useQuery<SteamAppDetails | null>({
      queryKey: ["game-details", game.appid],
      queryFn: () => fetchGameDetails(game.appid),
      retry: 2,
    });

  const { data: imageDataUri } = useQuery<string>({
    queryKey: ["game-image", game.appid],
    queryFn: () => fetchImageAsDataUri(gameDetails?.header_image ?? ""),
    enabled: !!gameDetails?.header_image,
    persister: imagePersister,
  });

  const headerImage = imageDataUri ?? gameDetails?.header_image;
  const requirementsSection = gameDetails
    ? formatRequirementsSection(gameDetails.pc_requirements, gameDetails.linux_requirements)
    : "";
  const description = gameDetails?.short_description
    ? gameDetails.short_description.split("\n").map((line) => `> ${line}`).join("\n")
    : "";
  const markdown = loadingDetails
    ? `# ${game.name}\n\nLoading game details...`
    : headerImage
      ? `![${game.name}](${headerImage})

# ${game.name}

${description}${requirementsSection ? `\n\n---\n\n${requirementsSection}` : ""}`
      : `# ${game.name}

${description}${requirementsSection ? `\n\n---\n\n${requirementsSection}` : ""}`;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Steam App ID" text={game.appid} />

          {gameDetails && (
            <>
              {gameDetails.release_date?.date && (
                <Detail.Metadata.Label
                  title="Release Date"
                  text={gameDetails.release_date.date.trim()}
                />
              )}
              {gameDetails.developers && gameDetails.developers.length > 0 && (
                <Detail.Metadata.Label
                  title="Developer"
                  text={gameDetails.developers.map((d) => d.trim()).join(", ")}
                />
              )}
              {gameDetails.publishers && gameDetails.publishers.length > 0 && (
                <Detail.Metadata.Label
                  title="Publisher"
                  text={gameDetails.publishers.map((p) => p.trim()).join(", ")}
                />
              )}
              {gameDetails.genres && gameDetails.genres.length > 0 && (
                <Detail.Metadata.Label
                  title="Genres"
                  text={gameDetails.genres.slice(0, 5).map((genre: SteamGenre) => genre.description?.trim() ?? "").filter(Boolean).join(", ")}
                />
              )}
              {gameDetails.price_overview && (
                <Detail.Metadata.Label
                  title="Price"
                  text={
                    gameDetails.price_overview.discount_percent > 0
                      ? `${gameDetails.price_overview.final_formatted.trim()} (${gameDetails.price_overview.discount_percent}% off)`
                      : gameDetails.price_overview.final_formatted.trim()
                  }
                />
              )}
              {!gameDetails.price_overview && gameDetails.is_free && (
                <Detail.Metadata.Label title="Price" text="Free to Play" />
              )}
              {gameDetails.metacritic?.score != null && (
                <Detail.Metadata.Label
                  title="Metacritic Score"
                  text={`${gameDetails.metacritic.score}/100`}
                />
              )}
            </>
          )}

          {rating && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label
                title="ProtonDB Rating"
                text={formatTierName(rating.tier)}
                icon={{
                  source: Icon.Circle,
                  tintColor: getTierColor(rating.tier),
                }}
              />
              <Detail.Metadata.Label
                title="Confidence"
                text={
                  rating.confidence.charAt(0).toUpperCase() +
                  rating.confidence.slice(1)
                }
              />
              <Detail.Metadata.Label
                title="Reports"
                text={`${rating.total} community reports`}
              />
              <Detail.Metadata.Label
                title="Score"
                text={{
                  value: formatScore(rating.score),
                  color: getScoreColor(rating.score),
                }}
              />
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label
                title="Best Reported Tier"
                text={formatTierName(rating.bestReportedTier)}
                icon={{
                  source: Icon.Circle,
                  tintColor: getTierColor(rating.bestReportedTier),
                }}
              />
              <Detail.Metadata.Label
                title="Trending Tier"
                text={formatTierName(rating.trendingTier)}
                icon={{
                  source: Icon.Circle,
                  tintColor: getTierColor(rating.trendingTier),
                }}
              />
            </>
          )}

          {!rating && !loadingRating && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label
                title="ProtonDB Rating"
                text="No reports available"
              />
            </>
          )}


        </Detail.Metadata>
      }
      actions={<GameActions game={game} rating={rating} />}
    />
  );
}

function GameListItem({ game }: { game: SteamGame }) {
  const { data: rating } = useQuery({
    queryKey: ["protondb-rating", game.appid],
    queryFn: () => fetchProtonDBRating(game.appid),
  });

  const accessories: List.Item.Accessory[] = [];

  if (rating) {
    accessories.push({
      tag: {
        value: formatTierName(rating.tier),
        color: getTierColor(rating.tier),
      },
    });

    accessories.push({
      tag: {
        value: formatScore(rating.score),
        color: getScoreColor(rating.score),
      },
    });

    if (rating.total > 0) {
      accessories.push({
        icon: Icon.SpeechBubble,
        tag: {
          value: String(rating.total),
          color: Color.Blue,
        },
      });
    }
  }

  return (
    <List.Item
      key={game.appid}
      id={game.appid}
      title={game.name}
      icon={{ source: game.icon }}
      accessories={accessories}
      actions={
        <GameActions
          game={game}
          rating={rating}
          showDetailsAction={
            <Action.Push
              title="Show Details"
              target={
                <PersistQueryClientProvider
                  client={queryClient}
                  persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
                >
                  <GameDetail game={game} />
                </PersistQueryClientProvider>
              }
              icon={Icon.Eye}
              shortcut={{ modifiers: ["cmd"], key: "d" }}
            />
          }
        />
      }
    />
  );
}

function usePrefetchGameData() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback((appId: string | null) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!appId?.trim()) return;

    timerRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["protondb-rating", appId],
        queryFn: () => fetchProtonDBRating(appId),
      });

      queryClient
        .prefetchQuery({
          queryKey: ["game-details", appId],
          queryFn: () => fetchGameDetails(appId),
        })
        .then(() => {
          const details = queryClient.getQueryData<
            Awaited<ReturnType<typeof fetchGameDetails>>
          >(["game-details", appId]);
          if (details?.header_image) {
            queryClient.prefetchQuery({
              queryKey: ["game-image", appId],
              queryFn: () =>
                fetchImageAsDataUri(details.header_image as string),
            });
          }
        });
    }, 50);
  }, []);
}

function ProtonDBSearchContent({ isRestoring }: { isRestoring: boolean }) {
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);
  const prefetchGameData = usePrefetchGameData();

  const { data: featuredGames = [], isLoading: loadingFeatured } = useQuery({
    queryKey: ["featured-games"],
    queryFn: fetchFeaturedGames,
  });

  const {
    data: searchResults = [],
    isLoading: loadingSearch,
    isFetching: fetchingSearch,
  } = useQuery({
    queryKey: ["steam-search", deferredSearch],
    queryFn: ({ signal }) => searchSteamGames(deferredSearch, signal),
    enabled: deferredSearch.trim().length > 0,
    placeholderData: keepPreviousData,
  });

  const showingSearch = deferredSearch.trim().length > 0;
  const games = showingSearch ? searchResults : featuredGames;
  const isLoading =
    isRestoring ||
    (showingSearch ? loadingSearch || fetchingSearch : loadingFeatured);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Steam games..."
      onSearchTextChange={setSearchText}
      onSelectionChange={prefetchGameData}
    >
      {games.length === 0 && !isLoading ? (
        showingSearch ? (
          <List.EmptyView
            title="No games found"
            description="Try different search terms"
            icon={Icon.XMarkCircle}
          />
        ) : (
          <List.EmptyView
            title="Search Steam Games"
            description="Type to search for games and see their ProtonDB compatibility ratings"
            icon={Icon.MagnifyingGlass}
          />
        )
      ) : (
        <>
          {!showingSearch && games.length > 0 && (
            <List.Section title="Featured Games" />
          )}
          {showingSearch && games.length > 0 && (
            <List.Section title={`${games.length} Games Found`} />
          )}
          {games.map((game) => (
            <GameListItem key={game.appid} game={game} />
          ))}
        </>
      )}
    </List>
  );
}

export default function ProtonDBSearch() {
  const [isRestored, setIsRestored] = useState(false);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0];
            return key !== "game-image" && key !== "steam-search";
          },
        },
      }}
      onSuccess={() => setIsRestored(true)}
    >
      <ProtonDBSearchContent isRestoring={isRestored === false} />
    </PersistQueryClientProvider>
  );
}
