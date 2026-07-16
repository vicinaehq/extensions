import { Action, ActionPanel, Icon, List } from '@vicinae/api';
import { useHyprctlData } from './hooks';
import type { HyprMonitor } from './types';
import { focusHyprTarget, formatRefreshRate, formatResolution } from './utils';

type MonitorListProps = {
  command: string;
  emptyTitle: string;
  emptyDescription: string;
  sectionTitle: string;
  searchBarPlaceholder: string;
};

export function MonitorList({
  command,
  emptyTitle,
  emptyDescription,
  sectionTitle,
  searchBarPlaceholder,
}: MonitorListProps) {
  const [monitors, isLoading] = useHyprctlData<HyprMonitor[]>(
    command,
    [],
    'Failed to load monitors'
  );

  return (
    <List isLoading={isLoading} searchBarPlaceholder={searchBarPlaceholder}>
      {monitors.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Monitor}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <List.Section
          title={sectionTitle}
          subtitle={monitors.length.toString()}
        >
          {monitors.map((monitor) => {
            const resolution = formatResolution(monitor.width, monitor.height);
            const refreshRate = formatRefreshRate(monitor.refreshRate);
            const position =
              monitor.x === undefined || monitor.y === undefined
                ? 'No position'
                : `${monitor.x},${monitor.y}`;
            const model = [monitor.make, monitor.model]
              .filter(Boolean)
              .join(' ');

            return (
              <List.Item
                key={monitor.name || monitor.id}
                title={monitor.name}
                subtitle={`${model || monitor.description} - ${resolution} @ ${refreshRate}`}
                icon={Icon.Monitor}
                keywords={[
                  monitor.name,
                  monitor.description,
                  monitor.make ?? '',
                  monitor.model ?? '',
                  monitor.serial ?? '',
                ]}
                accessories={[
                  ...(monitor.focused
                    ? [{ text: 'Focused', icon: Icon.Eye }]
                    : []),
                  ...(monitor.disabled
                    ? [{ text: 'Disabled', icon: Icon.XMarkCircle }]
                    : []),
                  {
                    text: monitor.activeWorkspace?.name
                      ? `Workspace ${monitor.activeWorkspace.name}`
                      : 'No workspace',
                    icon: Icon.AppWindow,
                  },
                  ...(monitor.scale === undefined
                    ? []
                    : [{ text: `Scale ${monitor.scale}`, icon: Icon.Cog }]),
                  { text: position },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Focus Monitor"
                      icon={Icon.Eye}
                      onAction={() => focusHyprTarget('monitor', monitor.name)}
                    />
                    <Action.CopyToClipboard
                      title="Copy Output Name"
                      content={monitor.name}
                    />
                    <Action.CopyToClipboard
                      title="Copy Description"
                      content={monitor.description}
                    />
                    <Action.CopyToClipboard
                      title="Copy Resolution"
                      content={`${resolution}@${refreshRate}`}
                    />
                    <Action.CopyToClipboard
                      title="Copy JSON"
                      content={JSON.stringify(monitor, null, 2)}
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
