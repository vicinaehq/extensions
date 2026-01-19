import { List, ActionPanel, Action, Icon, showToast, Color, LaunchProps, Clipboard } from "@vicinae/api";
import { getJJStatus } from "./utils/status";
import { JJStatus as JJStatusType, JJArguments } from "./utils/cli";
import { RepoPathValidationError } from "./components/validation";
import { ClipboardAction, ViewLogAction, ViewDiffAction, ManageBookmarksAction, OpenInTerminalAction, StatusItemActions } from "./components/actions";

export default function JJStatusCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  if (!repoPath) {
    return <RepoPathValidationError />;
  }

  const status: JJStatusType = getJJStatus(repoPath);

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
              <StatusItemActions filePath={item.title} repoPath={repoPath} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}