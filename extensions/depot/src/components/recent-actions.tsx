import {
  Action,
  ActionPanel,
  Alert,
  Detail,
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
import { escapeMarkdown, fencedTextBlock } from "../utils/package-details.ts";

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
          subtitle={action.kind === "failed" && action.summary
            ? `${action.source} · ${action.summary}`
            : `${action.source} · ${action.identifier}`}
          icon={action.kind === "failed" ? Icon.Exclamationmark : Icon.CheckCircle}
          accessories={[{ text: new Date(action.timestamp) }]}
          actions={
            <ActionPanel>
              {action.kind === "failed" && (
                <Action.Push
                  title="Review Failure"
                  icon={Icon.BlankDocument}
                  target={<FailureDetails action={action} />}
                />
              )}
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
          description="Completed operations and failures will appear here."
        />
      )}
    </List>
  );
}

function FailureDetails({ action }: { action: RecentAction }) {
  const summary = action.summary ?? "The operation failed";
  const details = action.details ?? "The package manager did not provide technical details.";
  const diagnostic = [
    summary,
    `Source: ${action.source}`,
    `Identifier: ${action.identifier}`,
    `Time: ${action.timestamp}`,
    "",
    details,
  ].join("\n");

  return (
    <Detail
      navigationTitle="Operation Failure"
      markdown={[
        `## ${escapeMarkdown(summary)}`,
        fencedTextBlock(details),
      ].join("\n\n")}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Application" text={action.name} />
          <Detail.Metadata.Label title="Source" text={action.source} />
          <Detail.Metadata.Label title="Identifier" text={action.identifier} />
          <Detail.Metadata.Label
            title="Time"
            text={new Date(action.timestamp).toLocaleString()}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Failure Details"
            content={diagnostic}
          />
        </ActionPanel>
      }
    />
  );
}

function pastTenseLabel(kind: RecentAction["kind"]): string {
  return kind[0]!.toUpperCase() + kind.slice(1);
}
