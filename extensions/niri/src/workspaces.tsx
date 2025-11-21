import { List, Icon, ActionPanel, Action } from "@vicinae/api";
import { useNiriArrayData } from "./hooks";
import type { Workspace, Window } from "./types";
import { NiriList } from "./components/NiriList";
import { runNiriAction, showSuccess } from "./utils";

export default function Workspaces() {
  const [workspaces, workspacesLoading, handleRefresh] = useNiriArrayData<Workspace>(
    "niri msg --json workspaces",
    "Failed to get workspaces",
  );

  const [windows] = useNiriArrayData<Window>(
    "niri msg --json windows",
    "Failed to get windows",
  );

  const loading = workspacesLoading;

  const focusWorkspace = async (workspaceRef: string | number) => {
    const success = await runNiriAction(`focus-workspace ${workspaceRef}`);
    if (success) {
      showSuccess(`Focused workspace ${workspaceRef}`);
      await handleRefresh();
    }
  };

  return (
    <NiriList
      loading={loading}
      emptyTitle="No Workspaces Found"
      emptyDescription="No workspaces are currently available."
      emptyIcon={Icon.Window}
    >
      {workspaces.map((workspace) => {
        const displayName = workspace.name || `Workspace ${workspace.idx}`;
        const workspaceWindows = windows.filter((window) => window.workspace_id === workspace.id);
        const windowCount = workspaceWindows.length;
        const activeWindow = windows.find((window) => window.id === workspace.active_window_id);
        const activeWindowTitle = activeWindow?.title;

        return (
          <List.Item
            key={workspace.id}
            title={displayName}
            subtitle={`Output: ${workspace.output}${activeWindowTitle ? ` • ${activeWindowTitle}` : ''}`}
            icon={Icon.Window}
            accessories={[
              workspace.is_focused ? { text: "Focused", icon: Icon.Eye } : {},
              workspace.is_active
                ? { text: "Active", icon: Icon.CheckCircle }
                : {},
              workspace.is_urgent
                ? { text: "Urgent", icon: Icon.ExclamationMark }
                : {},
              windowCount > 0 ? { text: `${windowCount} window${windowCount > 1 ? 's' : ''}`, icon: Icon.Window } : {},
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Focus Workspace"
                  icon={Icon.Eye}
                  onAction={() => focusWorkspace(workspace.name || workspace.idx.toString())}
                />
                <Action.CopyToClipboard
                  title="Copy Workspace ID"
                  content={workspace.id.toString()}
                />
                <Action.CopyToClipboard
                  title="Copy Workspace Index"
                  content={workspace.idx.toString()}
                />
                <Action.CopyToClipboard
                  title="Copy Output Name"
                  content={workspace.output}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </NiriList>
  );
}
