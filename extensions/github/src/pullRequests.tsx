import { Action, ActionPanel, getPreferenceValues, List } from "@vicinae/api";
import { useState } from "react";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useDebounce } from "@uidotdev/usehooks";
import { prDropdownItems } from "./config";
import { persister, queryClient } from "./queryClient";
import type { FilterType, GitHubPreferences } from "./types";
import { useGetMyRepos } from "./hooks/useGetRepos";
import { useGetPullRequests } from "./hooks/useGetPullRequests";

function PullRequests() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <Command />
    </PersistQueryClientProvider>
  );
}

const { defaultIssueFilter } = getPreferenceValues<GitHubPreferences>();

function Command() {
  const [filter, setFilter] = useState<FilterType>(defaultIssueFilter || "my");
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebounce(searchText, 300);

  const {
    data: prs = [],
    isLoading,
    isFetching,
  } = useGetPullRequests(filter, debouncedSearchText);
  const { data: repos = [] } = useGetMyRepos();

  return (
    <List
      isLoading={isLoading || isFetching}
      onSearchTextChange={setSearchText}
      searchText={searchText}
      searchBarPlaceholder="Filter by title, number, or assignee"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter PRs"
          storeValue={true}
          value={filter}
          onChange={(newValue) => setFilter(newValue as FilterType)}
        >
          {prDropdownItems.map((item) => (
            <List.Dropdown.Item
              key={item.value}
              title={item.title}
              value={item.value}
            />
          ))}
          <List.Dropdown.Section title="Repositories">
            {repos.map((repo) => (
              <List.Dropdown.Item
                key={repo.id}
                title={repo.name}
                icon={repo?.owner?.avatar_url}
                value={repo.full_name}
              />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {prs.map((pr) => {
        const repoName = pr.repository_url.replace(
          "https://api.github.com/repos/",
          "",
        );
        return (
          <List.Item
            key={pr.id}
            title={pr.title}
            subtitle={`#${pr.number} in ${repoName}`}
            icon="pr_icon.svg"
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open in Browser"
                  url={pr.html_url}
                />
                <Action.CopyToClipboard
                  title="Copy URL"
                  content={pr.html_url}
                />
                <Action.CopyToClipboard
                  title="Copy PR Number"
                  content={`#${pr.number}`}
                  shortcut={{ modifiers: ["ctrl"], key: "c" }}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export default PullRequests;
