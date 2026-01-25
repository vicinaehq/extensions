import { List, ActionPanel, Action, getPreferenceValues } from "@vicinae/api";
import { useState, useEffect } from "react";
import { Octokit } from "@octokit/rest";

import { useGitHubSearch } from "./hooks";
import { getRepositoryFilterQuery, repositoryDropdownItems } from "./filters";
import type { GitHubPreferencesMinimal } from "./types";

type Repository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
    [key: string]: any;
  } | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  [key: string]: any;
};

type FilterType = "all" | "my";

function Repositories() {
  const preferences = getPreferenceValues<GitHubPreferencesMinimal>();
  const [allMyRepos, setAllMyRepos] = useState<Repository[]>([]);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<FilterType>(preferences.defaultRepositoryFilter || 'my');

  const searchRepos = async (octokit: Octokit, query: string) => {
    if (query === 'user:@me') {
      // For "my repositories", get all repositories the user has access to
      const response = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        direction: 'desc',
        per_page: parseInt(preferences.numberOfResults || '50'),
        affiliation: 'owner,collaborator,organization_member'
      });
      return response.data;
    } else {
      // For other searches, use the search API
      const response = await octokit.search.repos({
        q: query,
        sort: 'updated',
        order: 'desc',
        per_page: parseInt(preferences.numberOfResults || '50')
      });
      return response.data.items;
    }
  };

  const { data: searchResults, isLoading } = useGitHubSearch<Repository>(
    searchRepos,
    filter === 'all' ? getRepositoryFilterQuery(filter, searchText) : (allMyRepos.length === 0 ? 'user:@me' : ''),
    preferences,
    filter === 'all' ? [searchText, filter] : [filter]
  );

  // Store all my repos when first loaded
  useEffect(() => {
    if (filter === 'my' && searchResults.length > 0 && allMyRepos.length === 0) {
      setAllMyRepos(searchResults);
    }
  }, [filter, searchResults, allMyRepos.length]);

  // Clear stored repos and cache when switching filters
  useEffect(() => {
    if (filter === 'all') {
      setAllMyRepos([]);
      // Note: Vicinae Cache handles LRU automatically, so we don't need manual clearing
      // The cache will evict old entries as needed
    }
  }, [filter]);

  // Filter repositories locally for "my" repositories
  const repositories = filter === 'my' && allMyRepos.length > 0
    ? allMyRepos.filter(repo =>
        searchText.trim() === '' ||
        repo.name.toLowerCase().includes(searchText.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(searchText.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(searchText.toLowerCase()))
      )
    : searchResults;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search in public and private repositories"
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter Repositories"
          storeValue={true}
          value={filter}
          onChange={(newValue) => setFilter(newValue as FilterType)}
        >
          {repositoryDropdownItems.map(item => (
            <List.Dropdown.Item key={item.value} title={item.title} value={item.value} />
          ))}
        </List.Dropdown>
      }
    >
      {repositories.map((repo) => (
        <List.Item
          key={repo.id}
          title={repo.name}
          subtitle={repo.full_name}
          icon={{ source: repo.owner?.avatar_url || "", fallback: "repo.svg" }}
          accessories={[
            { text: `${repo.stargazers_count} ⭐` },
            { text: `${repo.forks_count} 🍴` },
            ...(repo.language ? [{ text: repo.language }] : [])
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
                content={repo.html_url + '.git'}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export default Repositories;