import React, { useEffect, useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Arguments,
  Icon,
  LaunchProps,
  List,
} from "@vicinae/api";
import {
  cleanFolderSpecifier,
  fetchData,
  getHitIcon,
  HOME_DIRECTORY,
  prettifyData,
  PrettyHit,
  getDirectoryPath,
} from "./utils";

const SEARCH_MODES = {
  all: "all",
  file: "file",
  dir: "dir",
} as const;

type SearchMode = (typeof SEARCH_MODES)[keyof typeof SEARCH_MODES];

/** Runs the backend search and decorates results for UI rendering. */
async function loadHits(
  searchText: string,
  searchMode: SearchMode,
  folder: string,
): Promise<PrettyHit[]> {
  const rawHits = await fetchData(searchText, searchMode, folder);
  return prettifyData(rawHits);
}

/** Renders the interactive DMS file search list command. */
export default function ControlledList(
  props: LaunchProps<{ arguments: Arguments }>,
) {
  const [searchText, setSearchText] = useState("");
  const [hits, setHits] = useState<PrettyHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>(SEARCH_MODES.all);

  const searchFolder = useMemo(
    () =>
      cleanFolderSpecifier(props.arguments.folder_specifier ?? "") ||
      HOME_DIRECTORY,
    [props.arguments.folder_specifier],
  );

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      const run = async () => {
        setIsLoading(true);

        try {
          const prettyHits = await loadHits(
            searchText,
            searchMode,
            searchFolder,
          );
          if (!cancelled) {
            setHits(prettyHits);
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      };

      void run();
    }, 10);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchFolder, searchMode, searchText]);

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search files..."
      searchBarAccessory={
        <List.Dropdown
          id="search_drop"
          tooltip="Search Mode"
          value={searchMode}
          onChange={(newValue) => setSearchMode(newValue as SearchMode)}
        >
          <List.Dropdown.Section title="Result Type" />
          <List.Dropdown.Item title="All" value={SEARCH_MODES.all} />
          <List.Dropdown.Item title="Files" value={SEARCH_MODES.file} />
          <List.Dropdown.Item title="Directories" value={SEARCH_MODES.dir} />
        </List.Dropdown>
      }
    >
      <List.Section title="Results">
        {hits.map((hit) => (
          <List.Item
            key={hit.filePath}
            title={hit.fileName}
            icon={getHitIcon(hit)}
            subtitle={hit.curatedPath}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Open">
                  {(hit.applications ?? []).map((app) => (
                    <Action.Open
                      key={app.id}
                      title={`Open in ${app.name}`}
                      target={hit.filePath}
                      app={app}
                      icon={app.icon ?? Icon.BlankDocument}
                    />
                  ))}
                </ActionPanel.Section>

                <ActionPanel.Section title="Utility">
                  <Action.CopyToClipboard
                    title="Copy File Path"
                    content={hit.filePath}
                  />
                  <Action.CopyToClipboard
                    title="Copy Directory Path"
                    content={getDirectoryPath(hit.filePath)}
                  />
                  <Action.ShowInFinder
                    path={hit.filePath}
                    icon={Icon.NewFolder}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
