import { Action, ActionPanel, Icon, List } from '@vicinae/api';
import { useHyprctlData } from './hooks';
import type { HyprLayersResponse } from './types';
import { flattenLayers, formatRect } from './utils';

export default function Layers() {
  const [layersResponse, isLoading] = useHyprctlData<HyprLayersResponse>(
    'layers',
    {},
    'Failed to load layers'
  );
  const layers = flattenLayers(layersResponse);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search layers...">
      {layers.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Layer Surfaces"
          description="No Hyprland layer surfaces were returned by hyprctl."
        />
      ) : (
        <List.Section title="Layers" subtitle={layers.length.toString()}>
          {layers.map((layer) => (
            <List.Item
              key={`${layer.monitor}-${layer.level}-${layer.address}`}
              title={layer.namespace}
              subtitle={`${layer.monitor} - ${layer.layer} - ${formatRect(layer)}`}
              icon={Icon.AppWindow}
              keywords={[
                layer.namespace,
                layer.monitor,
                layer.layer,
                layer.pid.toString(),
              ]}
              accessories={[
                { text: layer.layer, icon: Icon.Cog },
                { text: `PID ${layer.pid}` },
              ]}
              actions={
                <ActionPanel>
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
                    title="Copy JSON"
                    content={JSON.stringify(layer, null, 2)}
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
