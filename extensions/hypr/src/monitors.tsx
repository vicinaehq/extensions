import { Action, ActionPanel, Color, Icon, List } from '@vicinae/api';
import { useHyprctlData } from './hooks';
import type { HyprMonitor } from './types';
import { focusHyprTarget } from './utils/dispatch';
import { formatRefreshRate, formatResolution } from './utils/format';

export default function Monitors() {
  const [outputs, isLoading] = useHyprctlData<HyprMonitor[]>(
    'monitors all',
    [],
    'Failed to load monitors'
  );

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search monitors...">
      {outputs.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Monitor}
          title="No Monitors Found"
          description="No Hyprland monitors were returned by hyprctl."
        />
      ) : (
        <List.Section title="Monitors" subtitle={outputs.length.toString()}>
          {outputs.map((output) => {
            const resolution = formatResolution(output.width, output.height);
            const refreshRate = formatRefreshRate(output.refreshRate);
            const model = [output.make, output.model].filter(Boolean).join(' ');

            return (
              <List.Item
                key={output.name || output.id}
                title={output.name}
                subtitle={`${model || output.description} - ${resolution} @ ${refreshRate}`}
                icon={Icon.Monitor}
                keywords={[
                  output.name,
                  output.description,
                  output.make ?? '',
                  output.model ?? '',
                  output.serial ?? '',
                ]}
                accessories={[
                  ...(output.focused
                    ? [
                        {
                          tag: { value: 'Focused', color: Color.Blue },
                          icon: Icon.Eye,
                        },
                      ]
                    : []),
                  ...(output.disabled
                    ? [
                        {
                          tag: { value: 'Disabled', color: Color.Red },
                          icon: Icon.XMarkCircle,
                        },
                      ]
                    : []),
                  {
                    tag: output.activeWorkspace?.name
                      ? `Workspace ${output.activeWorkspace.name}`
                      : 'No workspace',
                    icon: Icon.Desktop,
                  },
                  ...(output.scale === undefined || output.scale === 0
                    ? []
                    : [
                        {
                          tag: {
                            value: `Scale ${output.scale}`,
                            color: Color.Magenta,
                          },
                          icon: Icon.MagnifyingGlass,
                        },
                      ]),
                ]}
                actions={
                  <ActionPanel>
                    {!output.disabled ? (
                      <Action
                        title="Focus Monitor"
                        icon={Icon.Eye}
                        onAction={() => focusHyprTarget('monitor', output.name)}
                      />
                    ) : null}
                    <Action.CopyToClipboard
                      title="Copy Monitor Name"
                      content={output.name}
                    />
                    <Action.CopyToClipboard
                      title="Copy Description"
                      content={output.description}
                    />
                    <Action.CopyToClipboard
                      title="Copy Resolution"
                      content={`${resolution}@${refreshRate}`}
                    />
                    <Action.CopyToClipboard
                      title="Copy JSON"
                      content={JSON.stringify(output, null, 2)}
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
