import { Detail, ActionPanel, Action, showToast, LaunchProps, Toast } from "@vicinae/api";
import { execJJ } from "./utils";

interface Arguments {
  "repo-path": string;
}

export default function JJUndo(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  const handleUndo = async () => {
    try {
      execJJ("undo", repoPath);
      await showToast({ title: "Operation undone!", style: Toast.Style.Success });
    } catch (error) {
      await showToast({
        title: "Failed to undo",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

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
          <Action
            title="Undo Last Operation"
            onAction={handleUndo}
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