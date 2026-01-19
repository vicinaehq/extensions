import { List, ActionPanel, Action, Icon, showToast, Color, LaunchProps, Clipboard, useNavigation, LaunchType } from "@vicinae/api";
import { getJJLog, JJChange } from "./utils";
import JJDescribe from "./describe";
import JJNewChange from "./new-change";
import { NavigationActions } from "./actions";

interface Arguments {
  "repo-path": string;
}

export default function JJLog(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();
  const launchDescribe = () => push(<JJDescribe launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);
  const launchNewChange = () => push(<JJNewChange launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);

  if (!repoPath) {
    return (
      <List>
        <List.Item
          title="Repository path required"
          subtitle="Provide a repository path as argument"
          icon={Icon.Warning}
        />
      </List>
    );
  }

  const changes: JJChange[] = getJJLog(50, repoPath);

  return (
    <List>
      {changes.map((change) => (
        <List.Item
          key={change.change_id}
          title={change.description || "(no description)"}
          subtitle={`${change.author} • ${change.change_id.slice(0, 8)}`}
          icon={Icon.Circle}
          accessories={
            change.bookmarks.length > 0
              ? [
                  {
                    text: change.bookmarks.join(", "),
                    icon: Icon.Tag,
                  },
                ]
              : undefined
          }
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action
                  title="Copy Change ID"
                  onAction={async () => {
                    await Clipboard.copy(change.change_id);
                    await showToast({ title: "Copied change ID!" });
                  }}
                  shortcut={{ modifiers: ["ctrl"], key: "c" }}
                />
                <Action
                  title="Copy Commit ID"
                  onAction={async () => {
                    await Clipboard.copy(change.commit_id);
                    await showToast({ title: "Copied commit ID!" });
                  }}
                  shortcut={{ modifiers: ["ctrl"], key: "c" }}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action
                  title="Edit Description..."
                  onAction={launchDescribe}
                  shortcut={{ modifiers: ["ctrl"], key: "e" }}
                />
                <Action
                  title="Create New Change..."
                  onAction={launchNewChange}
                  shortcut={{ modifiers: ["ctrl"], key: "n" }}
                />
              </ActionPanel.Section>
              {NavigationActions.createCrossNavigation(repoPath, push, "log")}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
