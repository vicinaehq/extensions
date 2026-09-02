import {
  Action,
  ActionPanel,
  type Application,
  getApplications,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect } from "react";

import { useCachedPromise } from "@/hooks/useCachedPromise";

interface SelectEditorProps {
  onReset?: () => void;
  onSelect: (app: Application) => Promise<void> | void;
}

export default function SelectEditor({ onReset, onSelect }: SelectEditorProps) {
  const { pop } = useNavigation();
  const { data: apps, error, isLoading, revalidate } = useCachedPromise(() => getApplications(), []);

  useEffect(() => {
    if (!error || isLoading || !apps?.length) {
      return;
    }

    void showToast({ message: error.message, style: Toast.Style.Failure, title: "Couldn't load applications" });
  }, [apps, error, isLoading]);

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

  const showError = Boolean(error && !isLoading && !apps?.length);

  return (
    <List isLoading={isLoading} navigationTitle="Select App" searchBarPlaceholder="Search for an app...">
      {showError && (
        <List.EmptyView
          actions={
            <ActionPanel>
              <Action icon={Icon.ArrowClockwise} onAction={revalidate} title="Retry" />
              {onReset && <Action icon={Icon.ArrowCounterClockwise} onAction={handleReset} title="Reset to Default" />}
            </ActionPanel>
          }
          description={error?.message}
          title="Couldn't Load Applications"
        />
      )}
      {!showError && onReset && (
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
