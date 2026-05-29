import { Action, ActionPanel, Icon, List } from '@vicinae/api';
import { useHyprctlData } from './hooks';
import type { HyprWorkspace } from './types';
import { focusHyprTarget } from './utils';

export default function Workspaces() {
  const [workspaces, isLoading] = useHyprctlData<HyprWorkspace[]>(
    'workspaces',
    [],
    'Failed to load workspaces'
  );

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
              subtitle={`${workspace.monitor} - ${workspace.windows} window${
                workspace.windows === 1 ? '' : 's'
              }${workspace.lastwindowtitle ? ` - ${workspace.lastwindowtitle}` : ''}`}
              icon={Icon.AppWindow}
              keywords={[
                workspace.name,
                workspace.monitor,
                workspace.lastwindowtitle,
                workspace.tiledLayout ?? '',
              ]}
              accessories={[
                ...(workspace.hasfullscreen
                  ? [{ text: 'Fullscreen', icon: Icon.AppWindow }]
                  : []),
                ...(workspace.ispersistent
                  ? [{ text: 'Persistent', icon: Icon.CheckCircle }]
                  : []),
                { text: `ID ${workspace.id}` },
                ...(workspace.tiledLayout
                  ? [{ text: workspace.tiledLayout, icon: Icon.Cog }]
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
