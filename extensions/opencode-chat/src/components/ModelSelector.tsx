import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { useOpenCodeModels } from "../hooks/useOpenCodeModels";
import { providerStyle } from "../lib/providers";

interface ModelSelectorProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
}

export function ModelSelector({ currentModel, onSelect }: ModelSelectorProps) {
  const { models, providers, isLoading } = useOpenCodeModels();
  const { pop } = useNavigation();

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search models..."
      navigationTitle="Select Model"
    >
      {providers.map((provider) => {
        const style = providerStyle(`${provider.id}/x`);
        const providerModels = models.filter(
          (m) => m.provider === provider.id,
        );
        if (providerModels.length === 0) return null;

        return (
          <List.Section key={provider.id} title={provider.name}>
            {providerModels.map((model) => (
              <List.Item
                key={model.id}
                title={model.name}
                subtitle={model.id}
                icon={style.icon}
                accessories={
                  model.id === currentModel
                    ? [{ icon: Icon.Checkmark, tooltip: "Current" }]
                    : model.isDefault
                      ? [{ text: "default" }]
                      : []
                }
                actions={
                  <ActionPanel>
                    <Action
                      title="Select Model"
                      icon={Icon.CheckCircle}
                      onAction={() => {
                        onSelect(model.id);
                        pop();
                      }}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
