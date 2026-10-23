import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  WindowManagement,
} from '@vicinae/api';
import { useEffect, useMemo, useState } from 'react';
import { useHyprctlData } from './hooks';
import type { HyprClient } from './types';
import { focusHyprTarget } from './utils/dispatch';
import { formatWorkspace } from './utils/format';

type NativeWindow = Awaited<
  ReturnType<typeof WindowManagement.getWindows>
>[number];

export default function Windows() {
  const [clients, isLoading] = useHyprctlData<HyprClient[]>(
    'clients',
    [],
    'Failed to load windows'
  );
  const [nativeWindows, setNativeWindows] = useState<NativeWindow[]>([]);
  const [isShowingDetail, setIsShowingDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadNativeWindows = async () => {
      try {
        const windows = await WindowManagement.getWindows();

        if (!cancelled) {
          setNativeWindows(windows);
        }
      } catch (error) {
        console.warn('Failed to load native window metadata:', error);
      }
    };

    void loadNativeWindows();

    return () => {
      cancelled = true;
    };
  }, []);

  const nativeWindowsById = useMemo(
    () => new Map(nativeWindows.map((window) => [window.id, window])),
    [nativeWindows]
  );
  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) => {
        if (a.focusHistoryID === 0) return -1;
        if (b.focusHistoryID === 0) return 1;

        return a.workspace.id - b.workspace.id;
      }),
    [clients]
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search clients..."
    >
      {sortedClients.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Clients Found"
          description="No Hyprland clients were returned by hyprctl."
        />
      ) : (
        <List.Section
          title="Windows"
          subtitle={sortedClients.length.toString()}
        >
          {sortedClients.map((client) => {
            const workspace = formatWorkspace(
              client.workspace.id,
              client.workspace.name
            );
            const nativeWindow = nativeWindowsById.get(client.address);

            return (
              <List.Item
                key={client.address}
                title={client.title || client.class || client.address}
                subtitle={
                  isShowingDetail
                    ? undefined
                    : (nativeWindow?.application?.name ?? client.class)
                }
                icon={nativeWindow?.application?.icon ?? Icon.AppWindow}
                keywords={[
                  client.title,
                  client.class,
                  client.initialTitle,
                  client.initialClass,
                  workspace,
                  client.pid.toString(),
                ]}
                accessories={
                  isShowingDetail
                    ? []
                    : [
                        ...(client.floating
                          ? [
                              {
                                tag: { value: 'Floating', color: Color.Green },
                                icon: Icon.FloatingWindow,
                              },
                            ]
                          : []),
                        ...(client.focusHistoryID === 0
                          ? [
                              {
                                tag: { value: 'Current', color: Color.Blue },
                              },
                            ]
                          : []),
                        ...(client.fullscreen
                          ? [
                              {
                                tag: {
                                  value: 'Fullscreen',
                                  color: Color.Purple,
                                },
                                icon: Icon.Fullscreen,
                              },
                            ]
                          : []),
                        { tag: `WS ${workspace}` },
                      ]
                }
                actions={
                  <ActionPanel>
                    <Action
                      title="Focus Window"
                      icon={Icon.Eye}
                      onAction={() => focusHyprTarget('window', client.address)}
                    />
                    <Action
                      title={isShowingDetail ? 'Hide Details' : 'Show Details'}
                      icon={Icon.AppWindowSidebarRight}
                      shortcut={{ modifiers: ['cmd'], key: 'd' }}
                      onAction={() => setIsShowingDetail((visible) => !visible)}
                    />
                    <Action.CopyToClipboard
                      title="Copy Title"
                      content={client.title}
                    />
                    <Action.CopyToClipboard
                      title="Copy Class"
                      content={client.class}
                    />
                    <Action.CopyToClipboard
                      title="Copy Address"
                      content={client.address}
                    />
                    <Action.CopyToClipboard
                      title="Copy PID"
                      content={client.pid.toString()}
                    />
                    <Action.CopyToClipboard
                      title="Copy JSON"
                      content={JSON.stringify(client, null, 2)}
                    />
                  </ActionPanel>
                }
                detail={
                  <List.Item.Detail
                    metadata={
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label
                          title="Title"
                          text={client.title || '-'}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Application"
                          text={nativeWindow?.application?.name ?? client.class}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Class"
                          text={client.class || '-'}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Workspace"
                          text={workspace}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Monitor ID"
                          text={client.monitor.toString()}
                        />
                        <List.Item.Detail.Metadata.TagList title="State">
                          <List.Item.Detail.Metadata.TagList.Item
                            text={client.floating ? 'Floating' : 'Tiled'}
                            color={client.floating ? Color.Green : undefined}
                          />
                          {client.focusHistoryID === 0 ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Current"
                              color={Color.Blue}
                            />
                          ) : null}
                          {client.fullscreen ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text={
                                client.fullscreen === 1
                                  ? 'Maximized'
                                  : 'Fullscreen'
                              }
                              color={Color.Purple}
                            />
                          ) : null}
                          {client.pinned ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Pinned"
                              color={Color.Orange}
                            />
                          ) : null}
                          {client.hidden ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Hidden"
                              color={Color.SecondaryText}
                            />
                          ) : null}
                          {client.inhibitingIdle ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Inhibiting Idle"
                              color={Color.Yellow}
                            />
                          ) : null}
                        </List.Item.Detail.Metadata.TagList>
                        <List.Item.Detail.Metadata.TagList title="Protocol">
                          <List.Item.Detail.Metadata.TagList.Item
                            text={client.xwayland ? 'XWayland' : 'Wayland'}
                          />
                        </List.Item.Detail.Metadata.TagList>
                        <List.Item.Detail.Metadata.Label
                          title="Size"
                          text={`${client.size[0]} × ${client.size[1]}`}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Position (X, Y)"
                          text={`${client.at[0]}, ${client.at[1]}`}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="PID"
                          text={client.pid.toString()}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Address"
                          text={client.address}
                        />
                        {client.tags.length > 0 ? (
                          <List.Item.Detail.Metadata.TagList title="Tags">
                            {client.tags.map((tag) => (
                              <List.Item.Detail.Metadata.TagList.Item
                                key={tag}
                                text={tag}
                              />
                            ))}
                          </List.Item.Detail.Metadata.TagList>
                        ) : null}
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
