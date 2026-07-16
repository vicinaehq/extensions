import {
  Action,
  ActionPanel,
  Icon,
  List,
  WindowManagement,
} from '@vicinae/api';
import { useEffect, useMemo, useState } from 'react';
import { useHyprctlData } from './hooks';
import type { HyprClient } from './types';
import { focusHyprTarget, formatResolution, formatWorkspace } from './utils';

type NativeWindow = Awaited<ReturnType<typeof WindowManagement.getWindows>>[number];

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

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search clients...">
      {clients.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Clients Found"
          description="No Hyprland clients were returned by hyprctl."
        />
      ) : (
        <List.Section title="Windows" subtitle={clients.length.toString()}>
          {clients.map((client) => {
            const workspace = formatWorkspace(
              client.workspace.id,
              client.workspace.name
            );
            const size = formatResolution(client.size[0], client.size[1]);
            const position = `${client.at[0]},${client.at[1]}`;
            const nativeWindow = nativeWindowsById.get(client.address);

            return (
              <List.Item
                key={client.address}
                title={client.title || client.class || client.address}
                subtitle={`${client.class} - Workspace ${workspace} - Monitor ${client.monitor}`}
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
                  ...(client.visible
                    ? [{ text: 'Visible', icon: Icon.Eye }]
                    : []),
                  ...(client.floating
                    ? [{ text: 'Floating', icon: Icon.AppWindow }]
                    : []),
                  ...(client.pinned
                    ? [{ text: 'Pinned', icon: Icon.CheckCircle }]
                    : []),
                  ...(client.fullscreen
                    ? [{ text: 'Fullscreen', icon: Icon.AppWindow }]
                    : []),
                  { text: size },
                  { text: position },
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
