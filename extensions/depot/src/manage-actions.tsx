import {
  Action,
  Icon,
  LaunchType,
  Toast,
  launchCommand,
  showToast,
} from "@vicinae/api";
import { RecentActionsAction } from "./components/recent-actions.tsx";
import ExportProfileCommand from "./export-profile.tsx";
import {
  reportOperationFailure,
  type OperationFailureOptions,
} from "./utils/operation-feedback.ts";

/** Reports a failure that happened without a progress toast. */
export async function showOperationFailure(
  error: unknown,
  fallback: string,
  options?: OperationFailureOptions,
): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Failure, title: fallback });
  await reportOperationFailure(toast, error, fallback, options);
}

/** Actions available from every Depot Manage panel. */
export function ManageCommonActions({ onRefresh }: { onRefresh(): void }) {
  return (
    <>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        onAction={onRefresh}
      />
      <Action.Push
        title="Export Software Profile"
        icon={Icon.SaveDocument}
        target={<ExportProfileCommand />}
      />
      <RecentActionsAction />
    </>
  );
}

export function OpenDepotUpdateAction() {
  return (
    <Action
      title="Open Depot Update"
      icon={Icon.ArrowUpCircle}
      onAction={openDepotUpdate}
    />
  );
}

export async function openDepotUpdate(): Promise<void> {
  try {
    await launchCommand({ name: "update", type: LaunchType.UserInitiated });
  } catch (error) {
    await showOperationFailure(error, "Depot Update could not be opened");
  }
}

export function LaunchAction({ onLaunch }: { onLaunch(): void }) {
  return <Action title="Launch" icon={Icon.Play} onAction={onLaunch} />;
}

export function CheckForUpdateAction({ onCheck }: { onCheck(): void }) {
  return (
    <Action
      title="Check for Update"
      icon={Icon.ArrowClockwise}
      onAction={onCheck}
    />
  );
}

export function CancelRemovalAction({ onCancel }: { onCancel(): void }) {
  return (
    <Action
      title="Cancel Removal"
      icon={Icon.XMarkCircle}
      style={Action.Style.Destructive}
      shortcut={{ modifiers: ["ctrl"], key: "x" }}
      onAction={onCancel}
    />
  );
}

export function RemoveAction({
  title = "Remove",
  onRemove,
}: {
  title?: string;
  onRemove(): void;
}) {
  return (
    <Action
      title={title}
      icon={Icon.Trash}
      style={Action.Style.Destructive}
      onAction={onRemove}
    />
  );
}
