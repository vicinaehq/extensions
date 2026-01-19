import { List, ActionPanel, Action, showToast, LaunchProps, Toast } from "@vicinae/api";
import { execJJ, JJArguments } from "./utils/exec";
import { getErrorMessage } from "./utils/helpers";
import { ViewLogAction, AsyncAction } from "./components/actions";

export default function JJSquashCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  const items = [
    {
      title: "Squash All Changes",
      subtitle: "Move all changes from current change into parent",
      icon: "🔀",
      description: "This will move all the changes in the current change into its parent change, effectively merging them.",
      operation: async () => {
        execJJ("squash", repoPath);
        await showToast({ title: "Changes squashed into parent!", style: Toast.Style.Success });
      },
    },
    {
      title: "Interactive Squash",
      subtitle: "Select which changes to move to parent",
      icon: "🎯",
      description: "Open an interactive UI to select specific changes or hunks to move into the parent change.",
      operation: async () => {
        execJJ("squash -i", repoPath);
        await showToast({ title: "Interactive squash completed!", style: Toast.Style.Success });
      },
    }
  ];

  return (
    <List>
      <List.Section title="Squash Options">
        {items.map((item, index) => (
          <List.Item
            key={index}
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            actions={
                <ActionPanel>
                  <AsyncAction
                    title={item.title}
                    operation={item.operation}
                    successTitle={`${item.title} completed!`}
                    shortcut={{ modifiers: ["ctrl"], key: index === 0 ? "enter" as const : "i" as const }}
                  />
                  <ViewLogAction repoPath={repoPath} />
                </ActionPanel>
            }
          />
        ))}
</List.Section>
    </List>
  );
}