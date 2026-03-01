import { Action, ActionPanel, List } from "@vicinae/api";
import { useState } from "react";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useDebounce } from "@uidotdev/usehooks";
import { persister, queryClient } from "./queryClient";
import { useSearchRepos } from "./hooks/useSearchRepos";

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
  const debouncedSearchText = useDebounce(searchText, 300);

  const {
    data: repos = [],
    isLoading,
    isFetching,
  } = useSearchRepos(debouncedSearchText, true);

  return (
    <List
      isLoading={isLoading || isFetching}
      searchBarPlaceholder="Search for repositories by name..."
      onSearchTextChange={setSearchText}
      searchText={searchText}
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
