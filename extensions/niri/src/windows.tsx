import { List, Icon, ActionPanel, Action } from '@vicinae/api';
import { useNiriArrayData, useNiriObjectData } from './hooks';
import type { Window, Output, Workspace } from './types';
import { NiriList } from './components/NiriList';
import { runNiriAction, runNiriActionWithRefresh, showSuccess } from './utils';

export default function Windows() {
  const [windows, windowsLoading, handleRefresh] = useNiriArrayData<Window>(
    'niri msg --json windows',
    'Failed to get windows'
  );
  const [outputs] = useNiriObjectData<Output>('niri msg --json outputs', 'Failed to get outputs');
  const [workspaces] = useNiriArrayData<Workspace>(
    'niri msg --json workspaces',
    'Failed to get workspaces'
  );

  const focusWindow = async (windowId: number) => {
    await runNiriActionWithRefresh(
      `focus-window --id ${windowId}`,
      'Window focused',
      handleRefresh
    );
  };

  const closeWindow = async (windowId: number) => {
    await runNiriActionWithRefresh(`close-window --id ${windowId}`, 'Window closed', handleRefresh);
  };

  const toggleFullscreen = async (windowId: number) => {
    await runNiriActionWithRefresh(
      `fullscreen-window --id ${windowId}`,
      'Fullscreen toggled',
      handleRefresh
    );
  };

  const toggleWindowedFullscreen = async (windowId: number) => {
    await runNiriActionWithRefresh(
      `toggle-windowed-fullscreen --id ${windowId}`,
      'Windowed fullscreen toggled',
      handleRefresh
    );
  };

  const maximizeWindow = async (windowId: number) => {
    await runNiriActionWithRefresh(
      `maximize-window-to-edges --id ${windowId}`,
      'Window maximized to edges',
      handleRefresh
    );
  };

  const toggleFloating = async (windowId: number) => {
    await runNiriActionWithRefresh(
      `toggle-window-floating --id ${windowId}`,
      'Floating toggled',
      handleRefresh
    );
  };

  const setDynamicCastWindow = async (windowId: number) => {
    const success = await runNiriAction(`set-dynamic-cast-window --id ${windowId}`);
    if (success) {
      showSuccess('Dynamic cast target set to window');
    }
  };

  const toggleUrgent = async (windowId: number, currentlyUrgent: boolean) => {
    const action = currentlyUrgent
      ? `unset-window-urgent --id ${windowId}`
      : `set-window-urgent --id ${windowId}`;
    const success = await runNiriAction(action);
    if (success) {
      showSuccess(`Urgent ${currentlyUrgent ? 'unset' : 'set'}`);
      await handleRefresh();
    }
  };

  const screenshotWindow = async (windowId: number) => {
    const success = await runNiriAction(`screenshot-window --id ${windowId}`);
    if (success) {
      showSuccess('Screenshot taken');
    }
  };

  const moveWindowToMonitor = async (windowId: number, outputName: string) => {
    const success = await runNiriAction(`move-window-to-monitor --id ${windowId} ${outputName}`);
    if (success) {
      showSuccess(`Window moved to monitor ${outputName}`);
      await handleRefresh();
    }
  };

  return (
    <NiriList
      loading={windowsLoading}
      emptyTitle="No Windows Found"
      emptyDescription="No windows are currently open."
      emptyIcon={Icon.Window}
    >
      {windows.map((window) => (
        <List.Item
          key={window.id}
          title={window.title}
          subtitle={`${window.app_id} • Workspace ${window.workspace_id}`}
          icon={Icon.Window}
          accessories={[
            window.is_focused ? { text: 'Focused', icon: Icon.Eye } : {},
            window.is_floating ? { text: 'Floating', icon: Icon.Window } : {},
            window.is_urgent ? { text: 'Urgent', icon: Icon.ExclamationMark } : {},
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Focus Window"
                icon={Icon.Eye}
                onAction={() => focusWindow(window.id)}
              />
              <Action
                title="Close Window"
                icon={Icon.XMarkCircle}
                onAction={() => closeWindow(window.id)}
                style={Action.Style.Destructive}
              />
              <Action
                title="Screenshot Window"
                icon={Icon.Camera}
                onAction={() => screenshotWindow(window.id)}
              />
              {Object.keys(outputs)
                .filter((outputName) => {
                  const windowWorkspace = workspaces.find((ws) => ws.id === window.workspace_id);
                  return windowWorkspace?.output !== outputName;
                })
                .map((outputName) => (
                  <Action
                    key={outputName}
                    title={`Move to ${outputName}`}
                    icon={Icon.Monitor}
                    onAction={() => moveWindowToMonitor(window.id, outputName)}
                  />
                ))}
              <Action
                title="Set Dynamic Cast to Window"
                icon={Icon.Camera}
                onAction={() => setDynamicCastWindow(window.id)}
              />
              <Action
                title="Toggle Fullscreen"
                icon={Icon.Window}
                onAction={() => toggleFullscreen(window.id)}
              />
              <Action
                title="Maximize Window to Edges"
                icon={Icon.Window}
                onAction={() => maximizeWindow(window.id)}
              />
              <Action
                title="Toggle Windowed Fullscreen"
                icon={Icon.Window}
                onAction={() => toggleWindowedFullscreen(window.id)}
              />
              <Action
                title="Toggle Floating"
                icon={Icon.Window}
                onAction={() => toggleFloating(window.id)}
              />

              <Action
                title={`Toggle Urgent (${window.is_urgent ? 'On' : 'Off'})`}
                icon={Icon.ExclamationMark}
                onAction={() => toggleUrgent(window.id, window.is_urgent)}
              />

              <Action.CopyToClipboard title="Copy Window ID" content={window.id.toString()} />
              <Action.CopyToClipboard title="Copy Title" content={window.title} />
              <Action.CopyToClipboard title="Copy App ID" content={window.app_id} />
            </ActionPanel>
          }
        />
      ))}
    </NiriList>
  );
}
