import { List, Icon, ActionPanel, Action, closeMainWindow } from '@vicinae/api';
import { useMemo } from 'react';
import { useNiriArrayData } from './hooks';
import type { Workspace, Window } from './types';
import { NiriList } from './components/NiriList';
import { runNiriAction, showSuccess } from './utils';

type WorkspaceWindows = {
  workspace: Workspace;
  windows: Window[];
};

function windowFocusTime(window: Window): number {
  return window.focus_timestamp
    ? window.focus_timestamp.secs * 1e9 + window.focus_timestamp.nanos
    : 0;
}

function mostRecentWindowTime(windows: Window[]): number {
  return windows.reduce((max, w) => Math.max(max, windowFocusTime(w)), 0);
}

function compareWorkspacesByFocusTime(a: WorkspaceWindows, b: WorkspaceWindows): number {
  return mostRecentWindowTime(b.windows) - mostRecentWindowTime(a.windows);
}

export default function Workspaces() {
  const [workspaces, workspacesLoading, handleWorkspacesRefresh] = useNiriArrayData<Workspace>(
    'niri msg --json workspaces',
    'Failed to get workspaces'
  );

  const [windows, windowsLoading, handleWindowsRefresh] = useNiriArrayData<Window>('niri msg --json windows', 'Failed to get windows');

  const result = useMemo(() => {
    if (workspacesLoading || windowsLoading) return { loading: true, sorted: [], focusedOutput: undefined };

    const sorted = workspaces
      .map((workspace) => ({
        workspace,
        windows: windows.filter((window) => window.workspace_id === workspace.id),
      }))
      .sort(compareWorkspacesByFocusTime);

    const focusedOutput = sorted.find((ww) => ww.workspace.is_focused)?.workspace.output;

    return { loading: false, sorted, focusedOutput };
  }, [workspaces, windows, workspacesLoading, windowsLoading]);

  const focusWorkspace = async (workspace: Workspace, focusedOutput: string | undefined) => {
    const workspaceRef = workspace.name || workspace.idx.toString();
    if (workspace.output != focusedOutput) {
      await runNiriAction(`focus-monitor ${workspace.output}`);
    }
    const success = await runNiriAction(`focus-workspace ${workspaceRef}`);
    if (success) {
      await handleWorkspacesRefresh();
      await handleWindowsRefresh();
      closeMainWindow({clearRootSearch: true});
    }
  };

  return (
    <NiriList
      loading={result.loading}
      emptyTitle="No Workspaces Found"
      emptyDescription="No workspaces are currently available."
      emptyIcon={Icon.Window}
    >
      {result.sorted.map((workspaceWindows) => {
        const workspace = workspaceWindows.workspace;
        const displayName = workspace.name || `Workspace ${workspace.idx}`;
        const windowCount = workspaceWindows.windows.length;
        const activeWindow = workspaceWindows.windows.find((window) => window.id === workspace.active_window_id);
        const activeWindowTitle = activeWindow?.title;

        return (
          <List.Item
            key={workspace.id}
            title={displayName}
            subtitle={`Output: ${workspace.output}${activeWindowTitle ? ` • ${activeWindowTitle}` : ''}`}
            icon={Icon.Window}
            accessories={[
              workspace.is_focused ? { text: 'Focused', icon: Icon.Eye } : {},
              workspace.is_active ? { text: 'Active', icon: Icon.CheckCircle } : {},
              workspace.is_urgent ? { text: 'Urgent', icon: Icon.ExclamationMark } : {},
              windowCount > 0
                ? { text: `${windowCount} window${windowCount > 1 ? 's' : ''}`, icon: Icon.Window }
                : {},
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Focus Workspace"
                  icon={Icon.Eye}
                  onAction={() => focusWorkspace(workspace, result.focusedOutput)}
                />
                <Action.CopyToClipboard
                  title="Copy Workspace ID"
                  content={workspace.id.toString()}
                />
                <Action.CopyToClipboard
                  title="Copy Workspace Index"
                  content={workspace.idx.toString()}
                />
                <Action.CopyToClipboard title="Copy Output Name" content={workspace.output} />
              </ActionPanel>
            }
          />
        );
      })}
    </NiriList>
  );
}
