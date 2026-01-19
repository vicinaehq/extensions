import { List, ActionPanel, Action, showToast, LaunchProps, useNavigation, Color, Form, Clipboard, Toast, Icon, LaunchType } from "@vicinae/api";
import { execJJ, JJArguments } from "./utils/exec";
import { getJJLog, JJChange } from "./utils/log";
import { getErrorMessage } from "./utils/helpers";
import { RepoPathValidationError } from "./components/validation";
import { CopyIdAction, ViewLogAction, ViewStatusAction, GoToParentAction, GoToChildAction, PushItemAction, SearchChangesAction } from "./components/actions";

export default function JJEditCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    return <RepoPathValidationError />;
  }

  const recentChanges = getJJLog(10, repoPath);
  const relaunchEdit = () => push(<JJEditCommand launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);

  const handleEditChange = async (changeId: string) => {
    try {
      execJJ(`edit ${changeId}`, repoPath);
      await showToast({
        title: `Switched to change ${changeId.slice(0, 8)}`,
        style: Toast.Style.Success
      });
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
      const output = execJJ(`log -r 'description(${query})' --template 'change_id' -n 1`, repoPath);
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

  let currentChange: JJChange | null = null;
  try {
    const wcLog = getJJLog(1, repoPath);
    currentChange = wcLog[0] || null;
  } catch (error) {
    // Ignore
  }

  const items: { title: string; subtitle: string; icon: string; changeId: string; isCurrent: boolean; accessories: any[] }[] = [];

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
              <GoToParentAction repoPath={repoPath} shortcut={{ modifiers: ["ctrl"], key: "arrowUp" }} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Go to Child (next)"
          subtitle="Edit the next child change"
          icon="⬇️"
          actions={
            <ActionPanel>
              <GoToChildAction repoPath={repoPath} shortcut={{ modifiers: ["ctrl"], key: "arrowDown" }} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Search by Description"
          subtitle="Find and edit change by description"
          icon="🔍"
          actions={
            <ActionPanel>
              <SearchChangesAction repoPath={repoPath} onSubmit={handleEditByDescription} />
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
                <PushItemAction changeId={item.changeId} repoPath={repoPath} />
                <ActionPanel.Section>
                  <CopyIdAction id={item.changeId} idType="Change ID" />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <ViewLogAction repoPath={repoPath} />
                  <ViewStatusAction repoPath={repoPath} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}