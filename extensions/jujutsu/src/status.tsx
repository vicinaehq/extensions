import { List, ActionPanel, Action, Icon, showToast, Color, LaunchProps, Clipboard, useNavigation, LaunchType } from "@vicinae/api";
import { getJJStatus, JJStatus } from "./utils";
import JJLog from "./log";
import JJDiff from "./diff";
import JJBookmarks from "./bookmarks";
import { NavigationActions } from "./actions";

interface Arguments {
  "repo-path": string;
}

export default function JJStatus(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();
  const launchLog = () => push(<JJLog launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);
  const launchDiff = () => push(<JJDiff launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);
  const launchBookmarks = () => push(<JJBookmarks launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);

  if (!repoPath) {
    return (
      <List>
        <List.Item
          title="Repository path required"
          subtitle="Provide a repository path as argument"
          icon={Icon.Warning}
        />
      </List>
    );
  }

  const status: JJStatus = getJJStatus(repoPath);

  const items: { title: string; subtitle: string; icon: any; accessories: any[] }[] = [];

  // Working copy changes
  if (status.working_copy_changes.modified.length > 0) {
    status.working_copy_changes.modified.forEach(file => {
      items.push({
        title: file,
        subtitle: "Modified",
        icon: Icon.Document,
        accessories: [{ text: { value: "M", color: Color.Orange }, icon: Icon.Dot }],
      });
    });
  }

  if (status.working_copy_changes.added.length > 0) {
    status.working_copy_changes.added.forEach(file => {
      items.push({
        title: file,
        subtitle: "Added",
        icon: Icon.Document,
        accessories: [{ text: { value: "A", color: Color.Green }, icon: Icon.Dot }],
      });
    });
  }

  if (status.working_copy_changes.removed.length > 0) {
    status.working_copy_changes.removed.forEach(file => {
      items.push({
        title: file,
        subtitle: "Removed",
        icon: Icon.Document,
        accessories: [{ text: { value: "D", color: Color.Red }, icon: Icon.Dot }],
      });
    });
  }

  if (status.working_copy_changes.renamed.length > 0) {
    status.working_copy_changes.renamed.forEach(file => {
      items.push({
        title: file,
        subtitle: "Renamed",
        icon: Icon.Document,
        accessories: [{ text: { value: "R", color: Color.Blue }, icon: Icon.Dot }],
      });
    });
  }

  // If no changes, show clean status
  if (items.length === 0) {
    items.push({
      title: "Working copy is clean",
      subtitle: `Change: ${status.working_copy.change_id.slice(0, 8)}`,
      icon: Icon.CheckCircle,
      accessories: [{ text: { value: "Clean", color: Color.Green }, icon: Icon.Dot }],
    });
  }

  return (
    <List>
      {items.map((item, index) => (
        <List.Item
          key={index}
          title={item.title}
          subtitle={item.subtitle}
          icon={item.icon}
          accessories={item.accessories}
          actions={
            <ActionPanel>
              <Action
                title="Copy File Path"
                onAction={async () => {
                  await Clipboard.copy(item.title);
                  await showToast({ title: "Copied file path!" });
                }}
                shortcut={{ modifiers: ["ctrl"], key: "c" }}
              />
              <Action
                title="Open in Terminal"
                onAction={() => showToast({ title: "Opening terminal..." })}
                shortcut={{ modifiers: ["ctrl"], key: "t" }}
              />
              <ActionPanel.Section />
              <Action
                title="View Log..."
                onAction={launchLog}
                shortcut={{ modifiers: ["ctrl"], key: "l" }}
              />
              <Action
                title="View Diff..."
                onAction={launchDiff}
                shortcut={{ modifiers: ["ctrl"], key: "d" }}
              />
              <Action
                title="View Bookmarks..."
                onAction={launchBookmarks}
                shortcut={{ modifiers: ["ctrl"], key: "b" }}
              />
              {NavigationActions.createCrossNavigation(repoPath, push, "status")}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}