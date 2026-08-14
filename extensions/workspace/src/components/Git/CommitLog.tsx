import { Action, ActionPanel, List } from "@vicinae/api";

import { useCachedPromise } from "@/hooks/useCachedPromise";

import { Project } from "@/types";
import { getCommitLog, getRemoteUrl } from "@/utils/git";

interface CommitLogProps {
  project: Project;
}

export default function CommitLog({ project }: CommitLogProps) {
  const { data, isLoading } = useCachedPromise(
    async (path: string) => {
      const [commits, remoteUrl] = await Promise.all([getCommitLog(path), getRemoteUrl(path)]);
      return { commits, remoteUrl };
    },
    [project.fullPath],
    {
      initialData: { commits: [], remoteUrl: null },
    },
  );

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Commit Log - ${project.name}`}
      searchBarPlaceholder="Search commits..."
    >
      {(data?.commits ?? []).map((commit) => (
        <List.Item
          accessories={[{ text: commit.author, tooltip: "Author" }, { text: commit.relativeTime }]}
          actions={
            <ActionPanel>
              {data?.remoteUrl && (
                <Action.OpenInBrowser title="Open Commit in Browser" url={`${data.remoteUrl}/commit/${commit.hash}`} />
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
