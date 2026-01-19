import { List, ActionPanel, Action, showToast, LaunchProps, Toast } from "@vicinae/api";
import { execJJ, JJArguments } from "./utils/exec";
import { getErrorMessage } from "./utils/helpers";
import { AsyncAction } from "./components/actions";

export default function JJSplitCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  return (
    <List>
      <List.Section title="Split Current Change">
        <List.Item
          title="Split Change"
          subtitle="Break current change into smaller changes"
          icon="✂️"
          actions={
            <ActionPanel>
              <AsyncAction
                title="Start Split"
                operation={async () => {
                  execJJ("split", repoPath);
                  await showToast({ title: "Change split successfully!", style: Toast.Style.Success });
                }}
                successTitle="Change split successfully!"
                shortcut={{ modifiers: ["ctrl"], key: "enter" as const }}
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