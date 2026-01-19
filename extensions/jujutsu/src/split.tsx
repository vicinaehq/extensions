import { List, ActionPanel, Action, showToast, LaunchProps, Toast } from "@vicinae/api";
import { execJJ } from "./utils";

interface Arguments {
  "repo-path": string;
}

export default function JJSplit(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  const handleSplit = async () => {
    try {
      execJJ("split", repoPath);
      await showToast({ title: "Change split successfully!", style: Toast.Style.Success });
    } catch (error) {
      await showToast({
        title: "Failed to split change",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  return (
    <List>
      <List.Section title="Split Current Change">
        <List.Item
          title="Split Change"
          subtitle="Break current change into smaller changes"
          icon="✂️"
          actions={
            <ActionPanel>
              <Action
                title="Start Split"
                onAction={handleSplit}
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
      </List.Section>
      <List.Section title="How It Works">
        <List.Item
          title="Interactive Selection"
          subtitle="Choose files and hunks to split"
          icon="🎯"
        />
        <List.Item
          title="New Changes Created"
          subtitle="Selected changes become new change on top"
          icon="📝"
        />
        <List.Item
          title="Remaining Changes Stay"
          subtitle="Unselected changes remain in original change"
          icon="📦"
        />
      </List.Section>
      <List.Section title="Tips">
        <List.Item
          title="Plan Your Splits"
          subtitle="Think about logical groupings before splitting"
          icon="💡"
        />
        <List.Item
          title="Use for Better History"
          subtitle="Split large changes into focused, atomic commits"
          icon="📚"
        />
      </List.Section>
    </List>
  );
}