import { List, ActionPanel, Action, showToast, LaunchProps, useNavigation, Color, Form, Clipboard, Toast, Icon, LaunchType } from "@vicinae/api";
import { execJJ, getJJLog, JJChange } from "./utils";
import JJLog from "./log";
import JJStatus from "./status";

interface Arguments {
  "repo-path": string;
}

export default function JJEdit(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();
  const launchLog = () => push(<JJLog launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);
  const launchStatus = () => push(<JJStatus launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);
  const relaunchEdit = () => push(<JJEdit launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);

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

  // Get recent changes for navigation
  const recentChanges = getJJLog(10, repoPath);

  const handleEditChange = async (changeId: string) => {
    try {
      execJJ(`edit ${changeId}`, repoPath);
      await showToast({
        title: `Switched to change ${changeId.slice(0, 8)}`,
        style: Toast.Style.Success
      });
      // Refresh the view by navigating back to edit
      relaunchEdit();
    } catch (error) {
      await showToast({
        title: "Failed to edit change",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  const handleEditByDescription = async (query: string) => {
    try {
      // Use JJ's revset to find change by description
      const output = execJJ(`log -r 'description(${query})' --template 'change_id' -l 1`, repoPath);
      const changeId = output.trim();
      if (changeId) {
        await handleEditChange(changeId);
      } else {
        await showToast({
          title: "No change found",
          message: `No change with description containing "${query}"`,
          style: Toast.Style.Failure
        });
      }
    } catch (error) {
      await showToast({
        title: "Failed to find change",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  const handleNext = async () => {
    try {
      execJJ("next --edit", repoPath);
      await showToast({
        title: "Moved to next change",
        style: Toast.Style.Success
      });
      relaunchEdit();
    } catch (error) {
      await showToast({
        title: "No next change available",
        style: Toast.Style.Failure
      });
    }
  };

  const handlePrev = async () => {
    try {
      execJJ("edit @-", repoPath);
      await showToast({
        title: "Moved to parent change",
        style: Toast.Style.Success
      });
      relaunchEdit();
    } catch (error) {
      await showToast({
        title: "No parent change available",
        style: Toast.Style.Failure
      });
    }
  };

  // Current working copy info
  let currentChange: JJChange | null = null;
  try {
    const wcLog = getJJLog(1, repoPath);
    currentChange = wcLog[0] || null;
  } catch (error) {
    // Ignore
  }

  const items: { title: string; subtitle: string; icon: string; changeId: string; isCurrent: boolean; accessories: any[] }[] = [];

  // Current change
  if (currentChange) {
    items.push({
      title: `Current: ${currentChange.description || 'No description'}`,
      subtitle: `Change ${currentChange.change_id.slice(0, 8)}`,
      icon: "🎯",
      changeId: currentChange.change_id,
      isCurrent: true,
      accessories: [{ text: { value: "Current", color: Color.Green }, icon: "dot" }]
    });
  }

  // Recent changes
  recentChanges.forEach(change => {
    if (change.change_id !== currentChange?.change_id) {
      items.push({
        title: change.description || 'No description',
        subtitle: `Change ${change.change_id.slice(0, 8)} by ${change.author}`,
        icon: "📝",
        changeId: change.change_id,
        isCurrent: false,
        accessories: change.bookmarks.length > 0 ? [{ text: { value: change.bookmarks.join(", "), color: Color.Blue }, icon: "bookmark" }] : []
      });
    }
  });

  return (
    <List>
      <List.Section title="Time Travel - Edit Changes">
        <List.Item
          title="Quick Navigation"
          subtitle="Jump between changes in history"
          icon="⏰"
          accessories={[{ text: { value: "Time Travel", color: Color.Purple }, icon: "clock" }]}
        />
      </List.Section>
      <List.Section title="Navigation Actions">
        <List.Item
          title="Go to Parent (@-)"
          subtitle="Edit the parent of current change"
          icon="⬆️"
          actions={
            <ActionPanel>
              <Action
                title="Go to Parent"
                onAction={handlePrev}
                shortcut={{ modifiers: ["ctrl"], key: "arrowUp" }}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Go to Child (next)"
          subtitle="Edit the next child change"
          icon="⬇️"
          actions={
            <ActionPanel>
              <Action
                title="Go to Child"
                onAction={handleNext}
                shortcut={{ modifiers: ["ctrl"], key: "arrowDown" }}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Search by Description"
          subtitle="Find and edit change by description"
          icon="🔍"
          actions={
            <ActionPanel>
              <Action
                title="Search Changes"
                onAction={() => push(<SearchChangeForm repoPath={repoPath} onSubmit={handleEditByDescription} />)}
                shortcut={{ modifiers: ["ctrl"], key: "f" }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Recent Changes">
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
                  title={item.isCurrent ? "Already Current" : "Edit This Change"}
                  onAction={() => { if (!item.isCurrent) { void handleEditChange(item.changeId); } }}
                />
                <Action
                  title="View Log"
                  onAction={launchLog}
                  shortcut={{ modifiers: ["ctrl"], key: "l" }}
                />
                <Action
                  title="View Status"
                  onAction={launchStatus}
                  shortcut={{ modifiers: ["ctrl"], key: "s" }}
                />
                <Action
                  title="Copy Change ID"
                  onAction={async () => {
                    await Clipboard.copy(item.changeId);
                    await showToast({ title: "Change ID copied!" });
                  }}
                  shortcut={{ modifiers: ["ctrl"], key: "c" }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

// Search form component
function SearchChangeForm({ repoPath, onSubmit }: { repoPath: string; onSubmit: (query: string) => void }) {
  const handleSubmit = (values: Form.Values) => {
    const query = values.query as string;
    onSubmit(query);
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Search" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="query"
        title="Search Query"
      />
    </Form>
  );
}