import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Icon,
  Keyboard,
  type LaunchProps,
  List,
  open,
  showToast,
  Toast,
} from "@vicinae/api";
import ms from "ms";
import { useCallback, useDeferredValue, useState } from "react";
import {
  type FlathubApp,
  fetchAppDetails,
  fetchPopularApps,
  hasFlatpakHandler,
  PERSIST_MAX_AGE,
  persister,
  queryClient,
  searchFlathub,
} from "./api";

const canInstall = hasFlatpakHandler();

function formatInstalls(count?: number): string {
  if (!count) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M installs`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K installs`;
  return `${count} installs`;
}

function buildDetailMarkdown(
  screenshots: NonNullable<FlathubApp["screenshots"]>,
  app: FlathubApp,
  displayApp: FlathubApp,
): string {
  if (screenshots.length === 0) {
    return app.icon
      ? `<img src="${app.icon}" alt="${app.name}" style="width: 128px; height: auto;" />\n\n## ${displayApp.name}\n\n${displayApp.description || displayApp.summary}`
      : `# ${displayApp.name}\n\n${displayApp.description || displayApp.summary}`;
  }

  // Show up to 3 screenshots using larger images (624-752px) for better visibility.
  // Flathub typically provides: 112px (@1x/@2x), 224px, 624px, 752px, and original.
  // Convert WebP to PNG — Vicinae doesn't support WebP.
  return screenshots
    .slice(0, 3)
    .map((screenshot, idx) => {
      const largeImg = screenshot.sizes.find((s) => {
        const width = parseInt(s.width, 10);
        return width >= 624 && width <= 752;
      });
      const imgUrl =
        largeImg?.src || screenshot.sizes[screenshot.sizes.length - 1]?.src;
      if (!imgUrl) return null;
      const pngUrl = imgUrl.replace(/\.webp$/, ".png");
      const caption = screenshot.caption
        ? `\n\n<p style="text-align: center;"><em>${screenshot.caption}</em></p>`
        : "";
      return `<img src="${pngUrl}" alt="Screenshot ${idx + 1}" style="width: 100%; height: auto;" />${caption}`;
    })
    .filter((s): s is string => s !== null)
    .join("\n\n---\n\n");
}

function AppDetail({ app, enabled }: { app: FlathubApp; enabled: boolean }) {
  const { data: fullApp, isLoading } = useQuery({
    queryKey: ["flathub", "app-detail", app.app_id],
    queryFn: () => fetchAppDetails(app.app_id),
    staleTime: ms("10m"),
    enabled,
  });

  const displayApp = fullApp || app;
  const screenshots = displayApp.screenshots || [];
  const latestRelease = displayApp.releases?.[0];

  const markdown = isLoading
    ? "Loading app details..."
    : buildDetailMarkdown(screenshots, app, displayApp);

  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={markdown}
      metadata={
        <List.Item.Detail.Metadata>
          {displayApp.summary && (
            <List.Item.Detail.Metadata.Label
              title="Tagline"
              text={displayApp.summary}
            />
          )}
          {displayApp.developer_name && (
            <List.Item.Detail.Metadata.Label
              title="Developer"
              text={displayApp.developer_name}
            />
          )}
          {displayApp.installs_last_month && (
            <List.Item.Detail.Metadata.Label
              title="Installs"
              text={formatInstalls(displayApp.installs_last_month)}
            />
          )}
          {latestRelease && (
            <List.Item.Detail.Metadata.Label
              title="Version"
              text={latestRelease.version}
            />
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function AppListItem({
  app,
  showingDetail,
  onToggleDetail,
}: {
  app: FlathubApp;
  showingDetail: boolean;
  onToggleDetail: () => void;
}) {
  return (
    <List.Item
      id={app.app_id}
      title={app.name}
      subtitle={app.summary}
      icon={app.icon || Icon.AppWindow}
      accessories={
        app.installs_last_month
          ? [{ text: formatInstalls(app.installs_last_month) }]
          : []
      }
      detail={<AppDetail app={app} enabled={showingDetail} />}
      actions={
        <ActionPanel>
          <Action
            title="Toggle Detail"
            icon={Icon.AppWindowSidebarLeft}
            onAction={onToggleDetail}
            shortcut={{ modifiers: ["cmd"], key: "d" }}
          />
          <ActionPanel.Section>
            {canInstall && (
              <Action
                title="Install"
                icon={Icon.Download}
                shortcut={{ modifiers: ["ctrl"], key: "i" }}
                onAction={async () => {
                  await open(
                    `flatpak+https://dl.flathub.org/repo/appstream/${app.app_id}.flatpakref`,
                  );
                  await closeMainWindow();
                }}
              />
            )}
            <Action
              title="Open on Flathub"
              icon={Icon.Globe01}
              shortcut={
                Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common
              }
              onAction={async () => {
                await open(`https://flathub.org/apps/${app.app_id}`);
                await closeMainWindow();
              }}
            />
            <Action
              title="Copy App ID"
              icon={Icon.CopyClipboard}
              shortcut={
                Keyboard.Shortcut.Common.Copy as Keyboard.Shortcut.Common
              }
              onAction={async () => {
                await Clipboard.copy(app.app_id);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Copied App ID",
                  message: app.app_id,
                });
              }}
            />
            <Action
              title="Copy Install Command"
              icon={Icon.CopyClipboard}
              shortcut={
                Keyboard.Shortcut.Common.CopyName as Keyboard.Shortcut.Common
              }
              onAction={async () => {
                const cmd = `flatpak install flathub ${app.app_id}`;
                await Clipboard.copy(cmd);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Copied Install Command",
                  message: cmd,
                });
              }}
            />
            <Action.RunInTerminal
              title="Install in Terminal"
              icon={Icon.Terminal}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "i" }}
              args={["flatpak", "install", "flathub", app.app_id]}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function FlathubSearchContent({
  fallbackText,
  isRestoring,
}: {
  fallbackText?: string;
  isRestoring: boolean;
}) {
  const [searchText, setSearchText] = useState(fallbackText || "");
  const [showingDetail, setShowingDetail] = useState(false);
  const deferredSearch = useDeferredValue(searchText);

  const { data: popularApps = [], isLoading: loadingPopular } = useQuery({
    queryKey: ["flathub", "popular"],
    queryFn: fetchPopularApps,
    staleTime: ms("10m"),
  });
  const {
    data: searchResults = [],
    isLoading: loadingSearch,
    isFetching: fetchingSearch,
  } = useQuery({
    queryKey: ["flathub", "search", deferredSearch],
    queryFn: () => searchFlathub(deferredSearch),
    enabled: deferredSearch.trim().length > 0,
    placeholderData: keepPreviousData,
  });

  const showingSearch = searchText.trim().length > 0;
  const displayed = showingSearch ? searchResults : popularApps;
  // Use isFetching for search so the spinner shows during keepPreviousData transitions.
  // isRestoring suppresses the empty-state flash while the persisted cache is being hydrated.
  const isLoading =
    isRestoring ||
    (showingSearch ? loadingSearch || fetchingSearch : loadingPopular);
  const toggleDetail = useCallback(() => setShowingDetail((prev) => !prev), []);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showingDetail}
      searchBarPlaceholder="Search Flathub applications..."
      onSearchTextChange={setSearchText}
    >
      {showingSearch ? (
        displayed.length === 0 && !isLoading ? (
          <List.EmptyView
            title="No applications found"
            description="Try different search terms"
          />
        ) : (
          displayed.map((app) => (
            <AppListItem
              key={app.app_id}
              app={app}
              showingDetail={showingDetail}
              onToggleDetail={toggleDetail}
            />
          ))
        )
      ) : (
        <List.Section title="Popular Applications">
          {displayed.map((app) => (
            <AppListItem
              key={app.app_id}
              app={app}
              showingDetail={showingDetail}
              onToggleDetail={toggleDetail}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

export default function FlathubSearch(props: LaunchProps) {
  const [isRestored, setIsRestored] = useState(false);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
      onSuccess={() => setIsRestored(true)}
    >
      <FlathubSearchContent
        fallbackText={props.fallbackText}
        isRestoring={!isRestored}
      />
    </PersistQueryClientProvider>
  );
}
