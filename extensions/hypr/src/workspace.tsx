import { Action, ActionPanel, Color, Icon, List } from '@vicinae/api';
import { useState } from 'react';
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
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const isLoading = workspacesLoading || activeWorkspaceLoading;

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search workspaces..."
    >
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
              subtitle={
                isShowingDetail
                  ? undefined
                  : [
                      workspace.tiledLayout,
                      workspace.monitor,
                      getWindowsCountLabel(workspace.windows),
                    ]
                      .filter(Boolean)
                      .join(' - ')
              }
              icon={Icon.Overview}
              keywords={[
                workspace.name,
                workspace.monitor,
                workspace.lastwindowtitle,
                workspace.tiledLayout ?? '',
              ]}
              accessories={
                isShowingDetail
                  ? []
                  : [
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
                        ? [
                            {
                              tag: {
                                value: `Persistent`,
                                color: Color.PrimaryText,
                              },
                            },
                          ]
                        : []),
                    ]
              }
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
                  <Action
                    title={isShowingDetail ? 'Hide Details' : 'Show Details'}
                    icon={Icon.AppWindowSidebarRight}
                    shortcut={{ modifiers: ['cmd'], key: 'd' }}
                    onAction={() => setIsShowingDetail((visible) => !visible)}
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
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label
                        title="Name"
                        text={workspace.name || '-'}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="ID"
                        text={workspace.id.toString()}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Monitor"
                        text={workspace.monitor || '-'}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Monitor ID"
                        text={workspace.monitorID.toString()}
                      />
                      {workspace.tiledLayout ? (
                        <List.Item.Detail.Metadata.TagList title="Layout">
                          <List.Item.Detail.Metadata.TagList.Item
                            text={workspace.tiledLayout}
                          />
                        </List.Item.Detail.Metadata.TagList>
                      ) : null}
                      {workspace.id === activeWorkspace?.id ||
                      workspace.hasfullscreen ||
                      workspace.ispersistent ? (
                        <List.Item.Detail.Metadata.TagList title="State">
                          {workspace.id === activeWorkspace?.id ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Current"
                              color={Color.Blue}
                            />
                          ) : null}
                          {workspace.hasfullscreen ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Fullscreen"
                              color={Color.Purple}
                            />
                          ) : null}
                          {workspace.ispersistent ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Persistent"
                              color={Color.PrimaryText}
                            />
                          ) : null}
                        </List.Item.Detail.Metadata.TagList>
                      ) : null}
                      <List.Item.Detail.Metadata.Label
                        title="Windows"
                        text={workspace.windows.toString()}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Last Window"
                        text={workspace.lastwindowtitle || '-'}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Last Window Address"
                        text={workspace.lastwindow || '-'}
                      />
                    </List.Item.Detail.Metadata>
                  }
                />
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
