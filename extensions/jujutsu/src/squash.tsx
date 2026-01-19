import { List, ActionPanel, Action, showToast, LaunchProps, useNavigation, Toast, LaunchType } from "@vicinae/api";
import { execJJ } from "./utils";
import JJLog from "./log";

interface Arguments {
  "repo-path": string;
}

export default function JJSquash(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();
  const launchLog = () => push(<JJLog launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);

  const handleSquashAll = async () => {
    try {
      execJJ("squash", repoPath);
      await showToast({ title: "Changes squashed into parent!", style: Toast.Style.Success });
    } catch (error) {
      await showToast({
        title: "Failed to squash changes",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  const handleInteractiveSquash = async () => {
    try {
      execJJ("squash -i", repoPath);
      await showToast({ title: "Interactive squash completed!", style: Toast.Style.Success });
    } catch (error) {
      await showToast({
        title: "Interactive squash failed",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  const items = [
    {
      title: "Squash All Changes",
      subtitle: "Move all changes from current change into parent",
      icon: "🔀",
      description: "This will move all the changes in the current change into its parent change, effectively merging them."
    },
    {
      title: "Interactive Squash",
      subtitle: "Select which changes to move to parent",
      icon: "🎯",
      description: "Open an interactive UI to select specific changes or hunks to move into the parent change."
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
                <Action
                  title={item.title}
                  onAction={index === 0 ? handleSquashAll : handleInteractiveSquash}
                  shortcut={{ modifiers: ["ctrl"], key: index === 0 ? "enter" : "i" }}
                />
                <Action
                  title="View Log First"
                  onAction={launchLog}
                  shortcut={{ modifiers: ["ctrl"], key: "l" }}
                />
                <Action
                  title="Cancel"
                  onAction={() => showToast({ title: "Operation cancelled" })}
                  shortcut={{ modifiers: ["ctrl"], key: "[" }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Information">
        <List.Item
          title="About Squashing"
          subtitle="Combine changes to keep history clean"
          icon="ℹ️"
          actions={
            <ActionPanel>
              <Action
                title="Learn More"
                onAction={() => showToast({
                  title: "Squashing combines changes",
                  message: "Use squash to merge multiple small changes into fewer, more meaningful commits"
                })}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}