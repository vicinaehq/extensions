import { List } from "@vicinae/api";
import { useOpenCodeModels } from "../hooks/useOpenCodeModels";
import { providerStyle } from "../lib/providers";
import { modelName } from "../lib/types";

interface ModelDropdownProps {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelDropdown({ value, onChange }: ModelDropdownProps) {
  const { models, providers, isLoading } = useOpenCodeModels();

  // While loading or no models, show just the current value
  if (isLoading || models.length === 0) {
    return (
      <List.Dropdown tooltip="Model" value={value} onChange={onChange}>
        <List.Dropdown.Item
          key={value}
          title={modelName(value)}
          value={value}
        />
      </List.Dropdown>
    );
  }

  // Ensure current value is in the list
  const hasCurrentValue = models.some((m) => m.id === value);

  return (
    <List.Dropdown tooltip="Model" value={value} onChange={onChange}>
      {!hasCurrentValue && (
        <List.Dropdown.Item
          key={value}
          title={modelName(value)}
          value={value}
          icon={providerStyle(value).icon}
        />
      )}
      {providers.map((provider) => {
        const style = providerStyle(`${provider.id}/x`);
        const providerModels = models.filter(
          (m) => m.provider === provider.id,
        );
        if (providerModels.length === 0) return null;

        return (
          <List.Dropdown.Section key={provider.id} title={provider.name}>
            {providerModels.map((model) => (
              <List.Dropdown.Item
                key={model.id}
                title={model.name}
                value={model.id}
                icon={style.icon}
              />
            ))}
          </List.Dropdown.Section>
        );
      })}
    </List.Dropdown>
  );
}
