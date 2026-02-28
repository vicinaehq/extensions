import { Action, ActionPanel, getPreferenceValues, List } from "@vicinae/api";
import { useState } from "react";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useDebounce } from "@uidotdev/usehooks";
import { persister, queryClient } from "./queryClient";
import type { GitHubPreferencesMinimal } from "./types";
import { useMyGithubRepos, useSearchGithubRepos } from "./hooks/useGithubRepos";
import { repositoryDropdownItems } from "./config";

function Repositories() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <Command />
    </PersistQueryClientProvider>
  );
}

function Command() {
  const preferences = getPreferenceValues<GitHubPreferencesMinimal>();
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebounce(searchText, 300);
  const [filter, setFilter] = useState<FilterType>(
    preferences.defaultRepositoryFilter || "my",
  );

  const { data: myRepos = [], isLoading, isFetching } = useMyGithubRepos();

  const {
    data: searchRepos = [],
    isLoading: isSearchLoading,
    isFetching: isSearchFetching,
  } = useSearchGithubRepos(debouncedSearchText, true);

  const repos = filter === "all" ? searchRepos : myRepos;

  return (
    <List
      isLoading={isLoading || isFetching || isSearchLoading || isSearchFetching}
      searchBarPlaceholder="Search in public and private repositories"
      onSearchTextChange={setSearchText}
      filtering={filter !== "all"}
      searchText={searchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter Repositories"
          storeValue={true}
          value={filter}
          onChange={(newValue) => setFilter(newValue as FilterType)}
        >
          {repositoryDropdownItems.map((item) => (
            <List.Dropdown.Item
              key={item.value}
              title={item.title}
              value={item.value}
            />
          ))}
        </List.Dropdown>
      }
    >
      {repos.map((repo) => (
        <List.Item
          key={repo.id}
          title={repo.name}
          subtitle={repo.full_name}
          icon={{ source: repo.owner?.avatar_url || "", fallback: "repo.svg" }}
          accessories={[
            { text: `${repo.stargazers_count} ⭐` },
            { text: `${repo.forks_count} 🍴` },
            ...(repo.language ? [{ text: repo.language }] : []),
          ]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open Repository"
                url={repo.html_url}
              />
              <Action.CopyToClipboard
                title="Copy URL"
                content={repo.html_url}
                shortcut={{ modifiers: ["ctrl"], key: "c" }}
              />
              <Action.CopyToClipboard
                title="Copy Clone URL (HTTPS)"
                content={repo.html_url + ".git"}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export default Repositories;

type FilterType = "all" | "my";
