import {
  Action,
  ActionPanel,
  getPreferenceValues,
  Icon,
  List,
} from "@vicinae/api";
import { useState } from "react";

import { persister, queryClient } from "./queryClient";
import type { FilterType, GitHubPreferences } from "./types";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { issueDropdownItems } from "./config";
import { useDebounce } from "@uidotdev/usehooks";
import { useGetIssues } from "./hooks/useGetIssues";
import { useGetMyRepos } from "./hooks/useGetRepos";

function Issues() {
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
    data: issues = [],
    isLoading,
    isFetching,
  } = useGetIssues(filter, debouncedSearchText);
  const { data: repos = [] } = useGetMyRepos();

  return (
    <List
      isLoading={isLoading || isFetching}
      onSearchTextChange={setSearchText}
      searchText={searchText}
      searchBarPlaceholder="Filter by title, number, or assignee"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter Issues"
          storeValue={true}
          value={filter}
          onChange={(newValue) => setFilter(newValue as FilterType)}
        >
          {issueDropdownItems.map((item) => (
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
      {issues.map((issue) => {
        const repoName = issue.repository_url.replace(
          "https://api.github.com/repos/",
          "",
        );
        return (
          <List.Item
            key={issue.id}
            title={issue.title}
            subtitle={`#${issue.number} in ${repoName}`}
            icon={Icon.Warning}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open in Browser"
                  url={issue.html_url}
                />
                <Action.CopyToClipboard
                  title="Copy URL"
                  content={issue.html_url}
                />
                <Action.CopyToClipboard
                  title="Copy Issue Number"
                  content={`#${issue.number}`}
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

export default Issues;
