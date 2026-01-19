import { Detail, ActionPanel, Action, showToast, LaunchProps, Toast } from "@vicinae/api";
import { execJJ, getCurrentDescription } from "./utils";

interface Arguments {
  "repo-path": string;
}

export default function JJAbandon(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  const currentDescription = getCurrentDescription(repoPath);

  const handleAbandon = async () => {
    try {
      execJJ("abandon", repoPath);
      await showToast({ title: "Change abandoned!", style: Toast.Style.Success });
    } catch (error) {
      await showToast({
        title: "Failed to abandon change",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure,
      });
    }
  };

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
          <Action
            title="Abandon Change"
            onAction={handleAbandon}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl"], key: "enter" }}
          />
          <Action
            title="Cancel"
            onAction={() => showToast({ title: "Operation cancelled" })}
            shortcut={{ modifiers: ["ctrl"], key: "[" }}
          />
        </ActionPanel>
      }
    />
  );
}