import { Action, ActionPanel, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect } from "react";

import { useCachedPromise } from "@/hooks/useCachedPromise";

import { Project } from "@/types";
import { commitBrowserUrl, getCommitLog, getRemoteUrl } from "@/utils/git";

interface CommitLogProps {
  project: Project;
}

export default function CommitLog({ project }: CommitLogProps) {
  const { data, error, isLoading, revalidate } = useCachedPromise(
    async (path: string) => {
      const [commits, remoteUrl] = await Promise.all([getCommitLog(path), getRemoteUrl(path)]);
      return { commits, remoteUrl };
    },
    [project.fullPath],
  );

  useEffect(() => {
    if (!error || isLoading || !data?.commits.length) {
      return;
    }

    void showToast({ message: error.message, style: Toast.Style.Failure, title: "Couldn't load commits" });
  }, [data, error, isLoading]);

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Commit Log - ${project.name}`}
      searchBarPlaceholder="Search commits..."
    >
      {error && !isLoading && !data?.commits.length && (
        <List.EmptyView
          actions={
            <ActionPanel>
              <Action icon={Icon.ArrowClockwise} onAction={revalidate} title="Retry" />
            </ActionPanel>
          }
          description={error.message}
          title="Couldn't Load Commits"
        />
      )}
      {(data?.commits ?? []).map((commit) => (
        <List.Item
          accessories={[{ text: commit.author, tooltip: "Author" }, { text: commit.relativeTime }]}
          actions={
            <ActionPanel>
              {data?.remoteUrl && (
                <Action.OpenInBrowser
                  title="Open Commit in Browser"
                  url={commitBrowserUrl(data.remoteUrl, commit.hash)}
                />
              )}
              <Action.CopyToClipboard content={commit.hash} title="Copy Commit Hash" />
              <Action.CopyToClipboard
                content={commit.message}
                shortcut={{ key: "c", modifiers: ["cmd", "shift"] }}
                title="Copy Commit Message"
              />
            </ActionPanel>
          }
          key={commit.hash}
          subtitle={commit.hash.substring(0, 7)}
          title={commit.message}
        />
      ))}
    </List>
  );
}
