import { Action, ActionPanel, Color, Icon, List } from '@vicinae/api';
import { useState } from 'react';
import { useHyprctlData } from './hooks';
import type { HyprMonitor } from './types';
import { focusHyprTarget } from './utils/dispatch';
import {
  formatRefreshRate,
  formatResolution,
  formatWorkspace,
} from './utils/format';

export default function Monitors() {
  const [outputs, isLoading] = useHyprctlData<HyprMonitor[]>(
    'monitors all',
    [],
    'Failed to load monitors'
  );
  const [isShowingDetail, setIsShowingDetail] = useState(false);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search monitors..."
    >
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
                subtitle={
                  isShowingDetail
                    ? undefined
                    : `${model || output.description} - ${resolution} @ ${refreshRate}`
                }
                icon={Icon.Monitor}
                keywords={[
                  output.name,
                  output.description,
                  output.make ?? '',
                  output.model ?? '',
                  output.serial ?? '',
                ]}
                accessories={
                  isShowingDetail
                    ? []
                    : [
                        ...(output.focused
                          ? [
                              {
                                tag: { value: 'Focused', color: Color.Blue },
                                icon: Icon.Eye,
                              },
                            ]
                          : []),
                        ...(output.dpmsStatus === false
                          ? [
                              {
                                tag: {
                                  value: 'Off',
                                  color: Color.SecondaryText,
                                },
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
                          tag: output.activeWorkspace
                            ? `WS ${formatWorkspace(output.activeWorkspace.id, output.activeWorkspace.name)}`
                            : 'No workspace',
                        },
                      ]
                }
                actions={
                  <ActionPanel>
                    {!output.disabled ? (
                      <Action
                        title="Focus Monitor"
                        icon={Icon.Eye}
                        onAction={() => focusHyprTarget('monitor', output.name)}
                      />
                    ) : null}
                    <Action
                      title={isShowingDetail ? 'Hide Details' : 'Show Details'}
                      icon={Icon.AppWindowSidebarRight}
                      shortcut={{ modifiers: ['cmd'], key: 'd' }}
                      onAction={() => setIsShowingDetail((visible) => !visible)}
                    />
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
                detail={
                  <List.Item.Detail
                    metadata={
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label
                          title="Name"
                          text={output.name}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Monitor ID"
                          text={output.id.toString()}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Model"
                          text={model || output.description || '-'}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Serial"
                          text={output.serial || '-'}
                        />
                        <List.Item.Detail.Metadata.TagList title="State">
                          {output.disabled !== undefined ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text={output.disabled ? 'Disabled' : 'Enabled'}
                              color={output.disabled ? Color.Red : Color.Green}
                            />
                          ) : null}
                          {output.focused ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Focused"
                              color={Color.Blue}
                            />
                          ) : null}
                          {output.dpmsStatus !== undefined ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text={
                                output.dpmsStatus ? 'Powered On' : 'Powered Off'
                              }
                              color={
                                output.dpmsStatus
                                  ? undefined
                                  : Color.SecondaryText
                              }
                            />
                          ) : null}
                          {output.vrr ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="VRR"
                              color={Color.Purple}
                            />
                          ) : null}
                        </List.Item.Detail.Metadata.TagList>
                        <List.Item.Detail.Metadata.Label
                          title="Resolution"
                          text={resolution}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Refresh Rate"
                          text={refreshRate}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Scale"
                          text={output.scale?.toString() ?? 'Unknown'}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Position (X, Y)"
                          text={
                            output.x === undefined || output.y === undefined
                              ? 'Unknown'
                              : `${output.x}, ${output.y}`
                          }
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Workspace"
                          text={
                            output.activeWorkspace?.name ||
                            output.activeWorkspace?.id.toString() ||
                            'None'
                          }
                        />
                        {output.specialWorkspace?.name ? (
                          <List.Item.Detail.Metadata.Label
                            title="Special Workspace"
                            text={output.specialWorkspace.name}
                          />
                        ) : null}
                        {output.physicalWidth !== undefined &&
                        output.physicalHeight !== undefined ? (
                          <List.Item.Detail.Metadata.Label
                            title="Physical Size"
                            text={`${output.physicalWidth} × ${output.physicalHeight} mm`}
                          />
                        ) : null}
                        {output.currentFormat ? (
                          <List.Item.Detail.Metadata.Label
                            title="Pixel Format"
                            text={output.currentFormat}
                          />
                        ) : null}
                        {output.availableModes?.length ? (
                          <List.Item.Detail.Metadata.TagList title="Available Modes">
                            {output.availableModes.map((mode) => (
                              <List.Item.Detail.Metadata.TagList.Item
                                key={mode}
                                text={mode}
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
