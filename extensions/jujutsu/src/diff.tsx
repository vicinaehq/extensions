import { Detail, ActionPanel, Action, showToast, LaunchProps, Clipboard } from "@vicinae/api";
import { JJArguments } from "./utils/cli";
import { getJJDiff } from "./utils/diff";
import { RepoPathValidationErrorDetail } from "./components/validation";
import { ClipboardAction, NewChangeAction, DiffActions } from "./components/actions";

export default function JJDiffCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  if (!repoPath) {
    return <RepoPathValidationErrorDetail />;
  }

  const diff = getJJDiff(repoPath);

  if (!diff.trim()) {
    return (
      <Detail
        markdown="# No changes\n\nThe working copy is clean - no changes to show."
        actions={
          <NewChangeAction repoPath={repoPath} />
        }
      />
    );
  }

  return (
    <Detail
      markdown={`# JJ Diff - ${repoPath.split('/').pop()}\n\n\`\`\`diff\n${diff}\n\`\`\``}
        actions={
          <ActionPanel>
            <DiffActions diff={diff} repoPath={repoPath} />
          </ActionPanel>
        }
    />
  );
}
