import { List, Icon, ActionPanel, Action } from '@vicinae/api';
import { useNiriArrayData } from './hooks';
import type { Layer } from './types';
import { NiriList } from './components/NiriList';

export default function Layers() {
  const [layers, loading] = useNiriArrayData<Layer>(
    'niri msg --json layers',
    'Failed to get layers'
  );

  return (
    <NiriList
      loading={loading}
      emptyTitle="No Layer Surfaces"
      emptyDescription="No layer-shell surfaces are currently active."
      emptyIcon={Icon.Window}
    >
      {layers.map((layer) => (
        <List.Item
          key={`${layer.namespace}-${layer.output}-${layer.layer}`}
          title={layer.namespace}
          subtitle={`Layer: ${layer.layer} • Output: ${layer.output}`}
          icon={Icon.Window}
          accessories={[{ text: layer.keyboard_interactivity, icon: Icon.Gear }]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Namespace" content={layer.namespace} />
              <Action.CopyToClipboard title="Copy Layer" content={layer.layer} />
              <Action.CopyToClipboard title="Copy Output" content={layer.output} />
            </ActionPanel>
          }
        />
      ))}
    </NiriList>
  );
}
