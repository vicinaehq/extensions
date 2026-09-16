import { Action, ActionPanel, List, LocalStorage } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useDebounce } from "@uidotdev/usehooks";
import { persister, queryClient } from "./queryClient";
import { useGetOrganizations } from "./hooks/useGetOrganizations";
import { useGetMyRepos } from "./hooks/useGetRepos";
import {
  ALL_REPOSITORIES_SCOPE,
  MY_REPOSITORIES_SCOPE,
  ORGANIZATION_SCOPE_PREFIX,
  RepositorySearchScope,
  useSearchRepos,
} from "./hooks/useSearchRepos";

const REPOSITORY_SEARCH_SCOPE_KEY = "repository-search-scope";

const isRepositorySearchScope = (
  value: string | undefined,
): value is RepositorySearchScope =>
  value === ALL_REPOSITORIES_SCOPE ||
  value === MY_REPOSITORIES_SCOPE ||
  value?.startsWith(ORGANIZATION_SCOPE_PREFIX) === true;

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
  const [searchText, setSearchText] = useState("");
  const [scope, setScope] = useState<RepositorySearchScope>();
  const debouncedSearchText = useDebounce(searchText, 300);
  const { data: organizations = [], isLoading: isLoadingOrganizations } =
    useGetOrganizations();
  const isMyRepositoriesScope = scope === MY_REPOSITORIES_SCOPE;
  const {
    data: accessibleRepositories = [],
    isLoading: isLoadingAccessibleRepositories,
    isFetching: isFetchingAccessibleRepositories,
  } = useGetMyRepos(isMyRepositoriesScope);

  useEffect(() => {
    LocalStorage.getItem<string>(REPOSITORY_SEARCH_SCOPE_KEY).then(
      (storedScope) =>
        setScope(
          isRepositorySearchScope(storedScope)
            ? storedScope
            : ALL_REPOSITORIES_SCOPE,
        ),
      () => setScope(ALL_REPOSITORIES_SCOPE),
    );
  }, []);

  const handleScopeChange = async (newScope: string) => {
    const repositorySearchScope = newScope as RepositorySearchScope;
    setScope(repositorySearchScope);
    await LocalStorage.setItem(
      REPOSITORY_SEARCH_SCOPE_KEY,
      repositorySearchScope,
    );
  };

  const {
    data: searchResults = [],
    isLoading: isLoadingSearch,
    isFetching: isFetchingSearch,
  } = useSearchRepos(
    debouncedSearchText,
    scope ?? ALL_REPOSITORIES_SCOPE,
    scope !== undefined && !isMyRepositoriesScope,
  );

  const filteredAccessibleRepositories = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return accessibleRepositories;

    return accessibleRepositories.filter(
      (repository) =>
        repository.name.toLowerCase().includes(query) ||
        repository.full_name.toLowerCase().includes(query) ||
        repository.description?.toLowerCase().includes(query),
    );
  }, [accessibleRepositories, searchText]);

  const repos = isMyRepositoriesScope
    ? filteredAccessibleRepositories
    : searchResults;
  const isLoading =
    isLoadingOrganizations ||
    (isMyRepositoriesScope
      ? isLoadingAccessibleRepositories || isFetchingAccessibleRepositories
      : isLoadingSearch || isFetchingSearch);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search for repositories by name..."
      onSearchTextChange={setSearchText}
      searchText={searchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Search Scope"
          value={scope ?? ALL_REPOSITORIES_SCOPE}
          onChange={handleScopeChange}
        >
          <List.Dropdown.Item
            title="All GitHub"
            value={ALL_REPOSITORIES_SCOPE}
          />
          <List.Dropdown.Item
            title="My Repositories"
            value={MY_REPOSITORIES_SCOPE}
          />
          {organizations.length > 0 && (
            <List.Dropdown.Section title="Organizations">
              {organizations.map((organization) => (
                <List.Dropdown.Item
                  key={organization.id}
                  title={organization.login}
                  icon={organization.avatar_url}
                  value={`${ORGANIZATION_SCOPE_PREFIX}${organization.login}`}
                />
              ))}
            </List.Dropdown.Section>
          )}
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
              <Action.CopyToClipboard
                title="Copy Clone URL (SSH)"
                content={repo.git_url}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export default Repositories;
