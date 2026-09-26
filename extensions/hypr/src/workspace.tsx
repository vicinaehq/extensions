import { Action, ActionPanel, Color, Icon, List } from '@vicinae/api';
import { useHyprctlData } from './hooks';
import type { HyprWorkspace } from './types';
import { focusHyprTarget } from './utils/dispatch';

function getWindowsCountLabel(windowsCount: number) {
  return windowsCount >= 1
    ? `${windowsCount} window${windowsCount === 1 ? '' : 's'}`
    : '';
}

export default function Workspaces() {
  const [workspaces, workspacesLoading] = useHyprctlData<HyprWorkspace[]>(
    'workspaces',
    [],
    'Failed to load workspaces'
  );
  const [activeWorkspace, activeWorkspaceLoading] = useHyprctlData<
    HyprWorkspace | undefined
  >('activeworkspace', undefined, 'Failed to load active workspace');
  const isLoading = workspacesLoading || activeWorkspaceLoading;

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search workspaces...">
      {workspaces.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Workspaces Found"
          description="No Hyprland workspaces were returned by hyprctl."
        />
      ) : (
        <List.Section
          title="Workspaces"
          subtitle={workspaces.length.toString()}
        >
          {workspaces.map((workspace) => (
            <List.Item
              key={`${workspace.id}-${workspace.name}`}
              title={workspace.name || `Workspace ${workspace.id}`}
              subtitle={[
                workspace.tiledLayout,
                workspace.monitor,
                getWindowsCountLabel(workspace.windows),
              ]
                .filter(Boolean)
                .join(' - ')}
              icon={Icon.Desktop}
              keywords={[
                workspace.name,
                workspace.monitor,
                workspace.lastwindowtitle,
                workspace.tiledLayout ?? '',
              ]}
              accessories={[
                ...(workspace.id === activeWorkspace?.id
                  ? [{ tag: { value: 'Current', color: Color.Blue } }]
                  : []),
                ...(workspace.hasfullscreen
                  ? [
                      {
                        tag: { value: 'Fullscreen', color: Color.Purple },
                        icon: Icon.Fullscreen,
                      },
                    ]
                  : []),
                ...(workspace.ispersistent
                  ? [{ tag: { value: `Persistent`, color: Color.PrimaryText } }]
                  : []),
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Focus Workspace"
                    icon={Icon.Eye}
                    onAction={() =>
                      focusHyprTarget(
                        'workspace',
                        getWorkspaceDispatchArg(workspace)
                      )
                    }
                  />
                  <Action.CopyToClipboard
                    title="Copy Workspace Name"
                    content={workspace.name}
                  />
                  <Action.CopyToClipboard
                    title="Copy Workspace ID"
                    content={workspace.id.toString()}
                  />
                  <Action.CopyToClipboard
                    title="Copy Monitor"
                    content={workspace.monitor}
                  />
                  <Action.CopyToClipboard
                    title="Copy JSON"
                    content={JSON.stringify(workspace, null, 2)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function getWorkspaceDispatchArg(workspace: HyprWorkspace) {
  if (workspace.name.startsWith('special:')) {
    return workspace.name;
  }

  if (workspace.name && workspace.name !== workspace.id.toString()) {
    return `name:${workspace.name}`;
  }

  return workspace.id.toString();
}
