import { Action, ActionPanel, type Application, getApplications, Icon, List, useNavigation } from "@vicinae/api";

import { useCachedPromise } from "@/hooks/useCachedPromise";

interface SelectEditorProps {
  onReset?: () => void;
  onSelect: (app: Application) => Promise<void> | void;
}

export default function SelectEditor({ onReset, onSelect }: SelectEditorProps) {
  const { pop } = useNavigation();
  const { data: apps, isLoading } = useCachedPromise(() => getApplications(), []);

  const handleSelect = async (app: Application) => {
    await onSelect(app);
    pop();
  };

  const handleReset = async () => {
    if (onReset) {
      onReset();
    }

    pop();
  };

  return (
    <List isLoading={isLoading} navigationTitle="Select App" searchBarPlaceholder="Search for an app...">
      {onReset && (
        <List.Item
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Default">
                <Action onAction={handleReset} title="Reset to Default" />
              </ActionPanel.Section>
            </ActionPanel>
          }
          icon={Icon.ArrowCounterClockwise}
          subtitle="Use the default application"
          title="Default"
        />
      )}
      {apps?.map((app) => (
        <List.Item
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Selection">
                <Action icon={Icon.Check} onAction={() => handleSelect(app)} title="Select App" />
              </ActionPanel.Section>
            </ActionPanel>
          }
          icon={{ fileIcon: app.path }}
          key={app.id || app.path}
          title={app.name}
        />
      ))}
    </List>
  );
}
