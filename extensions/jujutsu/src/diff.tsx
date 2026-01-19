import { Detail, ActionPanel, Action, showToast, LaunchProps, Clipboard, useNavigation, LaunchType } from "@vicinae/api";
import { getJJDiff } from "./utils";
import JJNewChange from "./new-change";
import { NavigationActions } from "./actions";

interface Arguments {
  "repo-path": string;
}

export default function JJDiff(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    return (
      <Detail
        markdown="# Repository path required\n\nProvide a repository path as argument"
      />
    );
  }

  const diff = getJJDiff(repoPath);
  const launchNewChange = () => push(<JJNewChange launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);

  if (!diff.trim()) {
    return (
      <Detail
        markdown="# No changes\n\nThe working copy is clean - no changes to show."
        actions={
          <ActionPanel>
            <Action
              title="Create New Change..."
              onAction={launchNewChange}
              shortcut={{ modifiers: ["ctrl"], key: "n" }}
            />
            {NavigationActions.createCrossNavigation(repoPath, push, "diff")}
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Detail
      markdown={`# JJ Diff - ${repoPath.split('/').pop()}\n\n\`\`\`diff\n${diff}\n\`\`\``}
      actions={
        <ActionPanel>
          <Action
            title="Copy Diff"
            onAction={async () => {
              await Clipboard.copy(diff);
              await showToast({ title: "Copied diff to clipboard!" });
            }}
            shortcut={{ modifiers: ["ctrl"], key: "c" }}
          />
          <Action
            title="Create New Change"
            onAction={launchNewChange}
            shortcut={{ modifiers: ["ctrl"], key: "n" }}
          />
          {NavigationActions.createCrossNavigation(repoPath, push, "diff")}
        </ActionPanel>
      }
    />
  );
}