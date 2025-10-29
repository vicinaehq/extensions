import { Action, ActionPanel, getPreferenceValues, List } from "@raycast/api";
import { isValidElement, type ReactElement, useState } from "react";
import { OpenPreferences } from "./components/BrowserHistoryActions";
import { HistoryEntry } from "./components/ListEntries";
import { useHistorySearch } from "./hooks/useHistorySearch";
import type { Preferences } from "./interfaces";
import { SupportedBrowsers } from "./interfaces";

export default function Command(): ReactElement {
  const preferences = getPreferenceValues<Preferences>();
  const enabled =
    Object.entries(preferences).filter(([key, value]) => key.startsWith("enable") && value).length >
    0;
  const [searchText, setSearchText] = useState<string>();

  const searchTextEncoded = encodeURIComponent(searchText ?? "");
  const searchEngine = preferences.searchEngine;
  const searchUrl = searchEngine
    ? searchEngine.replace(/{{query}}/g, searchTextEncoded)
    : `https://www.google.com/search?q=${searchTextEncoded}`;

  const chromeResult = useHistorySearch(SupportedBrowsers.Chrome, searchText);
  const firefoxResult = useHistorySearch(SupportedBrowsers.Firefox, searchText);
  const safariResult = useHistorySearch(SupportedBrowsers.Safari, searchText);
  const edgeResult = useHistorySearch(SupportedBrowsers.Edge, searchText);
  const braveResult = useHistorySearch(SupportedBrowsers.Brave, searchText);
  const vivaldiResult = useHistorySearch(SupportedBrowsers.Vivaldi, searchText);
  const arcResult = useHistorySearch(SupportedBrowsers.Arc, searchText);
  const operaResult = useHistorySearch(SupportedBrowsers.Opera, searchText);
  const iridiumResult = useHistorySearch(SupportedBrowsers.Iridium, searchText);
  const orionResult = useHistorySearch(SupportedBrowsers.Orion, searchText);
  const sidekickResult = useHistorySearch(SupportedBrowsers.Sidekick, searchText);

  const allResults = [
    chromeResult,
    firefoxResult,
    safariResult,
    edgeResult,
    braveResult,
    vivaldiResult,
    arcResult,
    operaResult,
    iridiumResult,
    orionResult,
    sidekickResult,
  ];

  const enabledBrowsers = Object.entries(preferences)
    .filter(([key, val]) => key.startsWith("enable") && val)
    .map(([key]) => key.replace("enable", "") as SupportedBrowsers);

  const browserOrder = [
    SupportedBrowsers.Chrome,
    SupportedBrowsers.Firefox,
    SupportedBrowsers.Safari,
    SupportedBrowsers.Edge,
    SupportedBrowsers.Brave,
    SupportedBrowsers.Vivaldi,
    SupportedBrowsers.Arc,
    SupportedBrowsers.Opera,
    SupportedBrowsers.Iridium,
    SupportedBrowsers.Orion,
    SupportedBrowsers.Sidekick,
  ];

  const historyResults = enabledBrowsers
    .sort((a, b) => browserOrder.indexOf(a) - browserOrder.indexOf(b))
    .map((browser) => {
      const index = browserOrder.indexOf(browser);
      return allResults[index];
    });

  const isLoading: boolean[] = [];
  const permissionView: ReactElement[] = [];
  let noHistory = true;

  let entries = historyResults.map((entry) => {
    if (entry.permissionView) {
      if (entry.permissionView && isValidElement(entry.permissionView)) {
        permissionView.push(entry.permissionView);
      }
    }
    isLoading.push(entry.isLoading);

    if ((entry.data?.length ?? 0) > 0) {
      noHistory = false;
    }

    return (
      <List.Section title={entry.browser || ""} key={entry.browser}>
        {entry.data?.map((e) => (
          <HistoryEntry entry={e} key={e.id} />
        ))}
      </List.Section>
    );
  });

  if (permissionView.length > 0) {
    return permissionView[0];
  }

  entries.sort((a, b) => a.props.title.localeCompare(b.props.title));

  if (preferences.firstInResults) {
    const firstEntry = entries.filter((e) => e.props.title === preferences.firstInResults);
    entries = [
      firstEntry[0],
      ...entries.filter((e) => e.props.title !== preferences.firstInResults),
    ];
  }

  return (
    <List onSearchTextChange={setSearchText} isLoading={isLoading.some((e) => e)} throttle={false}>
      {!enabled ? (
        <List.EmptyView
          title="You haven't enabled any browsers yet"
          description="You can choose which browsers history to integrate in preferences"
          icon={"icon-small.png"}
          actions={
            <ActionPanel>
              <OpenPreferences />
            </ActionPanel>
          }
        />
      ) : noHistory ? (
        <List.EmptyView
          title={searchText ? `No ${searchText} history found` : "No history found"}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Search in Browser" url={searchUrl} />
            </ActionPanel>
          }
        />
      ) : (
        entries
      )}
    </List>
  );
}
