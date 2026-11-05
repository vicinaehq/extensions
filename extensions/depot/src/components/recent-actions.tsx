import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  List,
  confirmAlert,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  clearRecentActions,
  readRecentActions,
  type RecentAction,
} from "../recent-actions.ts";

export function RecentActionsAction() {
  return (
    <Action.Push
      title="Recent Actions"
      icon={Icon.Clock}
      target={<RecentActionsView />}
    />
  );
}

function RecentActionsView() {
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => {
    setIsLoading(true);
    void readRecentActions()
      .then(setActions)
      .catch((error: unknown) => {
        console.debug("Recent actions could not be loaded", error);
        setActions([]);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  const clear = async () => {
    const confirmed = await confirmAlert({
      title: "Clear recent actions?",
      message: "This removes Depot's small local activity list only.",
      primaryAction: {
        title: "Clear History",
        style: Alert.ActionStyle.Destructive,
      },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    });
    if (!confirmed) return;
    await clearRecentActions();
    setActions([]);
  };

  return (
    <List
      navigationTitle="Recent Depot Actions"
      searchBarPlaceholder="Search recent actions..."
      isLoading={isLoading}
    >
      {actions.map((action) => (
        <List.Item
          key={action.id}
          id={action.id}
          title={`${pastTenseLabel(action.kind)} ${action.name}`}
          subtitle={`${action.source} · ${action.identifier}`}
          accessories={[{ text: new Date(action.timestamp) }]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Identifier"
                content={action.identifier}
              />
              <Action
                title="Clear History"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={clear}
              />
            </ActionPanel>
          }
        />
      ))}
      {actions.length === 0 && !isLoading && (
        <List.EmptyView
          icon={Icon.Clock}
          title="No recent actions"
          description="Successful installs, removals, and updates will appear here."
        />
      )}
    </List>
  );
}

function pastTenseLabel(kind: RecentAction["kind"]): string {
  return kind[0]!.toUpperCase() + kind.slice(1);
}
