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
    <List isLoading={isLoading} searchBarPlaceholder="Search clients...">
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
                subtitle={nativeWindow?.application?.name ?? client.class}
                icon={nativeWindow?.application?.icon ?? Icon.AppWindow}
                keywords={[
                  client.title,
                  client.class,
                  client.initialTitle,
                  client.initialClass,
                  workspace,
                  client.pid.toString(),
                ]}
                accessories={[
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
                          tag: { value: 'Fullscreen', color: Color.Purple },
                          icon: Icon.Fullscreen,
                        },
                      ]
                    : []),
                  { tag: `WS ${workspace}` },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Focus Window"
                      icon={Icon.Eye}
                      onAction={() => focusHyprTarget('window', client.address)}
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
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
