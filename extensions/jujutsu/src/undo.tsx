import { Detail, ActionPanel, Action, showToast, LaunchProps, Toast } from "@vicinae/api";
import { execJJ, JJArguments } from "./utils/exec";
import { getErrorMessage } from "./utils/helpers";
import { DestructiveAsyncAction } from "./components/actions";

export default function JJUndoCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  return (
    <Detail
      markdown={`# Undo Last Operation

This will undo the last Jujutsu operation in the repository at:

**${repoPath}**

**Warning:** This action cannot be undone. Make sure you want to revert the last operation.

Common operations that can be undone:
- Creating a new change
- Editing descriptions
- Rebasing changes
- Squashing or splitting changes
- Abandoning changes`}
      actions={
        <ActionPanel>
          <DestructiveAsyncAction
            title="Undo Last Operation"
            operation={async () => {
              execJJ("undo", repoPath);
              await showToast({ title: "Operation undone!", style: Toast.Style.Success });
            }}
            successTitle="Operation undone!"
            shortcut={{ modifiers: ["ctrl"], key: "enter" as const }}
          />
        </ActionPanel>
      }
    />
  );
}