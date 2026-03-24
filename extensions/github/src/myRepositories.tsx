import { Action, ActionPanel, List } from "@vicinae/api";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useGetMyRepos } from "./hooks/useGetRepos";
import { persister, queryClient } from "./queryClient";

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
  const { data: repos = [], isLoading, isFetching } = useGetMyRepos();

  return (
    <List
      isLoading={isLoading || isFetching}
      searchBarPlaceholder="Filter repositories by name..."
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
