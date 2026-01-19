import { Detail, ActionPanel, Action, showToast, LaunchProps, Toast } from "@vicinae/api";
import { execJJ, JJArguments } from "./utils/exec";
import { getCurrentDescription } from "./utils/change";
import { getErrorMessage } from "./utils/helpers";
import { DestructiveAsyncAction } from "./components/actions";

export default function JJAbandonCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  const currentDescription = getCurrentDescription(repoPath);

  return (
    <Detail
      markdown={`# Abandon Current Change

This will permanently discard the current change and create a new empty change in its place.

**Repository:** ${repoPath}

**Current Change Description:**
${currentDescription ? `> ${currentDescription}` : "*No description*"}

**Warning:** This action cannot be undone. The current change and all its modifications will be lost.

This is useful when:
- You want to start fresh with your changes
- The current change has gone in the wrong direction
- You want to undo a series of changes without affecting history`}
      actions={
        <ActionPanel>
          <DestructiveAsyncAction
            title="Abandon Change"
            operation={async () => {
              execJJ("abandon", repoPath);
              await showToast({ title: "Change abandoned!", style: Toast.Style.Success });
            }}
            successTitle="Change abandoned!"
            shortcut={{ modifiers: ["ctrl"], key: "enter" as const }}
          />
        </ActionPanel>
      }
    />
  );
}