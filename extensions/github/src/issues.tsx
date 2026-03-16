import { List, ActionPanel, Action, getPreferenceValues, Icon } from "@vicinae/api";
import { useState } from "react";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { Octokit } from "@octokit/rest";

import { useGitHubSearch } from "./hooks";
import { getIssueFilterQuery, issueDropdownItems } from "./filters";
import type { GitHubPreferences } from "./types";

type Issue = RestEndpointMethodTypes["search"]["issuesAndPullRequests"]["response"]["data"]["items"][0];

type FilterType = "my-issues" | "assigned" | "mentioning" | "all";

function Issues() {
  const preferences = getPreferenceValues<GitHubPreferences>();
  const [filter, setFilter] = useState<FilterType>(preferences.defaultIssueFilter || 'my-issues');

  const searchIssues = async (octokit: Octokit, query: string) => {
    const response = await octokit.search.issuesAndPullRequests({
      q: query,
      sort: 'updated',
      order: 'desc',
      per_page: parseInt(preferences.numberOfResults || '50')
    });
    return response.data.items;
  };

  const { data: issues, isLoading } = useGitHubSearch<Issue>(
    searchIssues,
    getIssueFilterQuery(filter),
    preferences,
    [filter]
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Filter by title, number, or assignee"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter Issues"
          storeValue={true}
          value={filter}
          onChange={(newValue) => setFilter(newValue as FilterType)}
        >
          {issueDropdownItems.map(item => (
            <List.Dropdown.Item key={item.value} title={item.title} value={item.value} />
          ))}
        </List.Dropdown>
      }
    >
      {issues.map((issue) => {
        const repoName = issue.repository_url.replace('https://api.github.com/repos/', '');
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
                  url={`https://github.com/${repoName}/issues/${issue.number}`}
                />
                <Action.CopyToClipboard
                  title="Copy URL"
                  content={`https://github.com/${repoName}/issues/${issue.number}`}
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