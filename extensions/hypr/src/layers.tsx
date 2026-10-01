import { Action, ActionPanel, Color, Icon, List } from '@vicinae/api';
import { useState } from 'react';
import { useHyprctlData } from './hooks';
import type { HyprLayersResponse } from './types';
import { flattenLayers, formatRect } from './utils/layers';

const LAYER_COLORS = [
  Color.SecondaryText,
  Color.Green,
  Color.Blue,
  Color.Purple,
];

export default function Layers() {
  const [layersResponse, isLoading] = useHyprctlData<HyprLayersResponse>(
    'layers',
    {},
    'Failed to load layers'
  );
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const layers = flattenLayers(layersResponse);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search layers..."
    >
      {layers.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Layers Found"
          description="No Hyprland layer surfaces were returned by hyprctl."
        />
      ) : (
        <List.Section title="Layers" subtitle={layers.length.toString()}>
          {layers.map((layer) => (
            <List.Item
              key={`${layer.monitor}-${layer.level}-${layer.address}`}
              title={layer.namespace}
              subtitle={
                isShowingDetail
                  ? undefined
                  : `${layer.monitor} - ${formatRect(layer)}`
              }
              icon={Icon.AppWindow}
              keywords={[
                layer.namespace,
                layer.monitor,
                layer.layer,
                layer.pid.toString(),
              ]}
              accessories={
                isShowingDetail
                  ? []
                  : [
                      {
                        tag: {
                          value: layer.layer,
                          color:
                            LAYER_COLORS[layer.level] ?? Color.SecondaryText,
                        },
                      },
                      { tag: `PID ${layer.pid}` },
                    ]
              }
              actions={
                <ActionPanel>
                  <Action
                    title={isShowingDetail ? 'Hide Details' : 'Show Details'}
                    icon={Icon.AppWindowSidebarRight}
                    shortcut={{ modifiers: ['cmd'], key: 'd' }}
                    onAction={() => setIsShowingDetail((visible) => !visible)}
                  />
                  <Action.CopyToClipboard
                    title="Copy Namespace"
                    content={layer.namespace}
                  />
                  <Action.CopyToClipboard
                    title="Copy Monitor"
                    content={layer.monitor}
                  />
                  <Action.CopyToClipboard
                    title="Copy Address"
                    content={layer.address}
                  />
                  <Action.CopyToClipboard
                    title="Copy PID"
                    content={layer.pid.toString()}
                  />
                  <Action.CopyToClipboard
                    title="Copy JSON"
                    content={JSON.stringify(layer, null, 2)}
                  />
                </ActionPanel>
              }
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label
                        title="Namespace"
                        text={layer.namespace || '-'}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Monitor"
                        text={layer.monitor}
                      />
                      <List.Item.Detail.Metadata.TagList title="Layer">
                        <List.Item.Detail.Metadata.TagList.Item
                          text={`${layer.layer} (${layer.level})`}
                          color={
                            LAYER_COLORS[layer.level] ?? Color.SecondaryText
                          }
                        />
                      </List.Item.Detail.Metadata.TagList>
                      <List.Item.Detail.Metadata.Label
                        title="Size"
                        text={`${layer.w} × ${layer.h}`}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Position (X, Y)"
                        text={`${layer.x}, ${layer.y}`}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="PID"
                        text={layer.pid.toString()}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Address"
                        text={layer.address}
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
