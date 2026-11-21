import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  Keyboard,
  List,
  Toast,
  confirmAlert,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
} from "@vicinae/api";
import { useMemo, useRef } from "react";
import { aptBackend } from "./backends/apt.ts";
import {
  FlatpakBackend,
  FlatpakOperationError,
} from "./backends/flatpak.ts";
import { ShowSoftwareDetailsAction } from "./components/software-details.tsx";
import { RecentActionsAction } from "./components/recent-actions.tsx";
import {
  describeOperationError,
  isOperationCancelled,
  type OperationFailure,
} from "./errors.ts";
import { useSoftwareUpdates } from "./hooks/use-software-updates.ts";
import { useSoftwareOperation } from "./hooks/use-software-operation.ts";
import type {
  DepotPreferences,
  SoftwareOperationOptions,
  SoftwareSource,
  SoftwareUpdate,
} from "./types.ts";
import {
  recentActionSource,
  recordRecentAction,
  recordRecentActions,
} from "./recent-actions.ts";
import {
  softwareSourceLabel,
  updateAccessories,
} from "./utils/software-accessories.ts";
import {
  softwareItemKey,
  sortSoftwareAlphabetically,
} from "./utils/software-results.ts";
import { OperationLock } from "./utils/operation-lock.ts";
import {
  type FailedActionRecord,
  reportOperationFailure,
  reportOperationResult,
  showOperationBusy,
  updateOperationToast,
} from "./utils/operation-feedback.ts";
import { updateSourceErrors } from "./utils/update-errors.ts";

export default function UpdateCommand() {
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<DepotPreferences>();
  const flatpakBackend = useMemo(
    () => new FlatpakBackend(flatpakScope),
    [flatpakScope],
  );
  const updates = useSoftwareUpdates(
    flatpakBackend,
    aptEnabled,
    flatpakEnabled,
  );
  const operationLock = useRef(new OperationLock()).current;
  const operation = useSoftwareOperation();
  const aptUpdates = sortSoftwareAlphabetically(updates.aptUpdates);
  const flatpakUpdates = sortSoftwareAlphabetically(updates.flatpakUpdates);
  const totalUpdates = aptUpdates.length + flatpakUpdates.length;
  const sourceErrors = updateSourceErrors(
    updates.aptError,
    updates.flatpakError,
  );

  const updateOne = async (update: SoftwareUpdate) => {
    const key = softwareItemKey(update);
    if (!operationLock.tryAcquire(key)) {
      await showOperationBusy();
      return;
    }

    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Updating ${update.name}`,
        message: update.source === "apt"
          ? "Authenticate when prompted"
          : `Flatpak · ${update.flatpak?.scope ?? "unknown"}`,
      });
      const options = operation.start(
        key,
        (status) => updateOperationToast(toast, status),
      );

      try {
        if (update.source === "apt") await aptBackend.update(update, options);
        else await flatpakBackend.update(update, options);
        await recordRecentAction({
          kind: "updated",
          name: update.name,
          identifier: update.id,
          source: recentActionSource(update.source),
        });
        updates.removeCompleted([update]);
        updates.refresh();
        reportOperationResult(toast, {
          status: "success",
          title: `${update.name} updated`,
          message: update.availableVersion ?? update.id,
        });
      } catch (error) {
        await reportOperationFailure(toast, error, "Software update failed", {
          recent: {
            name: update.name,
            identifier: update.id,
            source: recentActionSource(update.source),
          },
          message: update.id,
        });
      }
    } finally {
      operation.finish(key);
      operationLock.release(key);
    }
  };

  const performSourceUpdate = async (
    source: "apt" | "flatpak",
    sourceUpdates: readonly SoftwareUpdate[],
    options: SoftwareOperationOptions,
  ) => {
    if (source === "apt") await aptBackend.updateAll(sourceUpdates, options);
    else await flatpakBackend.updateAll(sourceUpdates, options);
    await recordRecentActions(sourceUpdates.map((update) => ({
      kind: "updated" as const,
      name: update.name,
      identifier: update.id,
      source: recentActionSource(source),
    })));
  };

  const updateSource = async (source: "apt" | "flatpak") => {
    const sourceName = source === "apt" ? "APT" : "Flatpak";
    const sourceUpdates = source === "apt" ? aptUpdates : flatpakUpdates;
    if (sourceUpdates.length === 0) return;
    const key = `${source}-all`;
    if (!operationLock.tryAcquire(key)) {
      await showOperationBusy();
      return;
    }

    try {
      const confirmed = await confirmAlert({
        title: `Update ${sourceName} software?`,
        message: updateListPreview(sourceUpdates),
        primaryAction: { title: `Update ${sourceName}` },
        dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
      });
      if (!confirmed) return;

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Updating ${sourceName} software`,
        message: source === "apt"
          ? "Authenticate when prompted"
          : `${sourceUpdates.length} application${sourceUpdates.length === 1 ? "" : "s"}`,
      });
      const options = operation.start(
        key,
        (status) => updateOperationToast(toast, status),
      );

      try {
        await performSourceUpdate(source, sourceUpdates, options);
        updates.removeCompleted(sourceUpdates);
        updates.refresh();
        reportOperationResult(toast, {
          status: "success",
          title: `${sourceName} software updated`,
          message: "Checking for remaining updates",
        });
      } catch (error) {
        await reportOperationFailure(toast, error, `${sourceName} update failed`, {
          message: "No other software source was changed by this action",
          recent: sourceBatchRecord(source, sourceUpdates),
        });
      }
    } finally {
      operation.finish(key);
      operationLock.release(key);
    }
  };

  const updateAll = async () => {
    if (totalUpdates === 0) return;
    if (!operationLock.tryAcquire("all")) {
      await showOperationBusy();
      return;
    }

    try {
      const confirmed = await confirmAlert({
        title: `Update ${totalUpdates} software item${totalUpdates === 1 ? "" : "s"}?`,
        message: updateAllPreview(aptUpdates, flatpakUpdates),
        primaryAction: { title: "Update All" },
        dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
      });
      if (!confirmed) return;

      const queuedApt = updates.aptUpdates;
      const queuedFlatpak = updates.flatpakUpdates;
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Updating software",
        message: queuedApt.length > 0
          ? "Authenticate for APT when prompted"
          : `Flatpak · ${queuedFlatpak.length} application${queuedFlatpak.length === 1 ? "" : "s"}`,
      });
      const options = operation.start(
        "all",
        (status) => updateOperationToast(toast, status),
      );
      let aptFailure: OperationFailure | undefined;
      let flatpakFailure: OperationFailure | undefined;

      if (queuedApt.length > 0) {
        try {
          await performSourceUpdate("apt", queuedApt, options);
          updates.removeCompleted(queuedApt);
        } catch (error) {
          if (isOperationCancelled(error)) {
            await toast.hide();
            return;
          }
          console.error("APT update failed", error);
          aptFailure = describeOperationError(error, "APT update failed");
          await recordBatchFailure("apt", queuedApt, aptFailure);
        }
      }
      if (queuedFlatpak.length > 0) {
        try {
          await performSourceUpdate("flatpak", queuedFlatpak, options);
          updates.removeCompleted(queuedFlatpak);
        } catch (error) {
          if (isOperationCancelled(error)) {
            await toast.hide();
            return;
          }
          console.error("Flatpak update failed", error);
          flatpakFailure = describeOperationError(error, "Flatpak update failed");
          await recordBatchFailure("flatpak", queuedFlatpak, flatpakFailure);
        }
      }

      updates.refresh();
      reportSourceResults(toast, aptFailure, flatpakFailure, {
        success: "Software update completed",
        successMessage: "Checking for remaining updates",
        failure: "Software updates failed",
      });
    } finally {
      operation.finish("all");
      operationLock.release("all");
    }
  };

  const refreshMetadata = async () => {
    if (!operationLock.tryAcquire("refresh")) {
      await showOperationBusy();
      return;
    }

    try {
      // Ubuntu allows active sessions to refresh APT metadata without a
      // Polkit prompt (org.debian.apt.update-cache: allow_active=yes).
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Refreshing software metadata",
        message: aptEnabled
          ? "Refreshing APT package lists"
          : "Refreshing configured Flatpak remotes",
      });
      const aptOptions = aptEnabled
        ? operation.start(
          "refresh",
          (status) => updateOperationToast(toast, status),
        )
        : {
          onStatus: (status: Parameters<typeof updateOperationToast>[1]) =>
            updateOperationToast(toast, status),
        };

      const [aptResult, flatpakResult] = await Promise.allSettled([
        aptEnabled ? aptBackend.refreshMetadata(aptOptions) : Promise.resolve(),
        flatpakEnabled
          ? flatpakBackend.refreshMetadata(aptEnabled ? undefined : aptOptions)
          : Promise.resolve(),
      ]);
      const failureOf = (
        result: PromiseSettledResult<void>,
        fallback: string,
      ): OperationFailure | undefined => {
        if (result.status === "fulfilled" || isOperationCancelled(result.reason)) {
          return undefined;
        }
        if (
          result.reason instanceof FlatpakOperationError &&
          result.reason.kind === "unavailable"
        ) {
          return undefined;
        }
        console.error(fallback, result.reason);
        return describeOperationError(result.reason, fallback);
      };
      const aptFailure = failureOf(aptResult, "APT metadata refresh failed");
      const flatpakFailure = failureOf(flatpakResult, "Flatpak metadata refresh failed");
      const cancelled = [aptResult, flatpakResult].some((result) =>
        result.status === "rejected" && isOperationCancelled(result.reason)
      );

      updates.refresh();
      if (cancelled && !aptFailure && !flatpakFailure) {
        await toast.hide();
        return;
      }
      reportSourceResults(toast, aptFailure, flatpakFailure, {
        success: "Software metadata refreshed",
        successMessage: "Checking for updates",
        failure: "Metadata refresh failed",
      });
    } finally {
      operation.finish("refresh");
      operationLock.release("refresh");
    }
  };

  const sharedActions = (
    <>
      {totalUpdates > 0 && (
        <Action
          title="Update All"
          icon={Icon.Download}
          onAction={updateAll}
        />
      )}
      {aptUpdates.length > 0 && (
        <Action
          title="Update APT"
          icon={Icon.Download}
          onAction={() => updateSource("apt")}
        />
      )}
      {flatpakUpdates.length > 0 && (
        <Action
          title="Update Flatpak"
          icon={Icon.Download}
          onAction={() => updateSource("flatpak")}
        />
      )}
      {operation.isCancellable("all") && (
        <CancelUpdateAction
          title="Cancel Update All"
          onCancel={() => operation.cancel("all")}
        />
      )}
      {operation.isCancellable("apt-all") && (
        <CancelUpdateAction
          title="Cancel APT Update"
          onCancel={() => operation.cancel("apt-all")}
        />
      )}
      {operation.isCancellable("flatpak-all") && (
        <CancelUpdateAction
          title="Cancel Flatpak Update"
          onCancel={() => operation.cancel("flatpak-all")}
        />
      )}
      {operation.isCancellable("refresh") && (
        <CancelUpdateAction
          title="Cancel Metadata Refresh"
          onCancel={() => operation.cancel("refresh")}
        />
      )}
      {(aptEnabled || flatpakEnabled) && (
        <Action
          title="Refresh Package Metadata"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={refreshMetadata}
        />
      )}
      <RecentActionsAction />
    </>
  );

  return (
    <List
      isLoading={updates.isLoading}
      searchBarPlaceholder="Search available updates..."
      actions={<ActionPanel>{sharedActions}</ActionPanel>}
    >
      {totalUpdates > 0 && (
        <List.Section title="Software Updates" subtitle={`${totalUpdates}`}>
          <List.Item
            id="update-all"
            title={`Update All ${totalUpdates} ${totalUpdates === 1 ? "Item" : "Items"}`}
            subtitle={`APT: ${aptUpdates.length} · Flatpak: ${flatpakUpdates.length}`}
            icon={Icon.Download}
            actions={<ActionPanel>{sharedActions}</ActionPanel>}
          />
        </List.Section>
      )}

      {sourceErrors.length > 0 && totalUpdates > 0 && (
        <List.Section title="Source Warnings">
          <List.Item
            id="update-source-errors"
            title="Some update sources could not be checked"
            subtitle={sourceErrors.join(" · ")}
            icon={Icon.Exclamationmark}
            actions={<ActionPanel>{sharedActions}</ActionPanel>}
          />
        </List.Section>
      )}

      {aptUpdates.length > 0 && (
        <List.Section
          title="APT"
          subtitle={`${aptUpdates.length} update${aptUpdates.length === 1 ? "" : "s"}`}
        >
          {aptUpdates.map((update) => (
            <UpdateItem
              key={softwareItemKey(update)}
              update={update}
              onUpdate={() => updateOne(update)}
              onCancel={operation.isCancellable(softwareItemKey(update))
                ? () => operation.cancel(softwareItemKey(update))
                : undefined}
              sharedActions={sharedActions}
            />
          ))}
        </List.Section>
      )}

      {flatpakUpdates.length > 0 && (
        <List.Section
          title="Flatpak"
          subtitle={`${flatpakUpdates.length} update${flatpakUpdates.length === 1 ? "" : "s"}`}
        >
          {flatpakUpdates.map((update) => (
            <UpdateItem
              key={softwareItemKey(update)}
              update={update}
              onUpdate={() => updateOne(update)}
              onCancel={operation.isCancellable(softwareItemKey(update))
                ? () => operation.cancel(softwareItemKey(update))
                : undefined}
              sharedActions={sharedActions}
            />
          ))}
        </List.Section>
      )}

      {totalUpdates === 0 && !updates.isLoading && (
        <UpdatesEmptyView
          aptEnabled={aptEnabled}
          flatpakEnabled={flatpakEnabled}
          error={sourceErrors.join(" · ") || undefined}
          sharedActions={sharedActions}
        />
      )}
    </List>
  );
}

function UpdatesEmptyView({
  aptEnabled,
  flatpakEnabled,
  error,
  sharedActions,
}: {
  aptEnabled: boolean;
  flatpakEnabled: boolean;
  error?: string;
  sharedActions: React.ReactNode;
}) {
  const sourcesEnabled = aptEnabled || flatpakEnabled;
  let icon = Icon.CheckCircle;
  let title = "Software is up to date";
  let description = "Using currently cached package metadata";

  if (!sourcesEnabled) {
    icon = Icon.Cog;
    title = "No package sources enabled";
    description = "Enable APT or Flatpak in the extension preferences";
  } else if (error) {
    icon = Icon.XMarkCircle;
    title = "Updates could not be fully checked";
    description = error;
  }

  return (
    <List.EmptyView
      icon={icon}
      title={title}
      description={description}
      actions={
        <ActionPanel>
          {sourcesEnabled && sharedActions}
          <Action
            title="Open Extension Preferences"
            icon={Icon.Cog}
            onAction={() => openExtensionPreferences()}
          />
        </ActionPanel>
      }
    />
  );
}

function UpdateItem({
  update,
  onUpdate,
  onCancel,
  sharedActions,
}: {
  update: SoftwareUpdate;
  onUpdate(): void;
  onCancel?: () => void;
  sharedActions: React.ReactNode;
}) {
  const source = softwareSourceLabel(update, "scope");

  return (
    <List.Item
      id={softwareItemKey(update)}
      title={update.name}
      subtitle={update.description}
      keywords={[update.id, update.repository ?? "", source]}
      accessories={updateAccessories(update)}
      actions={
        <ActionPanel>
          <UpdateAction onUpdate={onUpdate} />
          {onCancel && (
            <CancelUpdateAction title="Cancel Update" onCancel={onCancel} />
          )}
          <ShowSoftwareDetailsAction
            pkg={update}
            primaryActions={
              <>
                <UpdateAction onUpdate={onUpdate} />
                {onCancel && (
                  <CancelUpdateAction title="Cancel Update" onCancel={onCancel} />
                )}
                {sharedActions}
              </>
            }
          />
          {sharedActions}
          <Action.CopyToClipboard title="Copy Package ID" content={update.id} />
        </ActionPanel>
      }
    />
  );
}

function CancelUpdateAction({
  title,
  onCancel,
}: {
  title: string;
  onCancel(): void;
}) {
  return (
    <Action
      title={title}
      icon={Icon.XMarkCircle}
      style={Action.Style.Destructive}
      shortcut={{ modifiers: ["ctrl"], key: "x" }}
      onAction={onCancel}
    />
  );
}

function UpdateAction({ onUpdate }: { onUpdate(): void }) {
  return (
    <Action
      title="Update"
      icon={Icon.Download}
      onAction={onUpdate}
    />
  );
}

function updateListPreview(
  updates: readonly SoftwareUpdate[],
  limit = 8,
): string {
  const lines = updates.slice(0, limit).map((update) => {
    const version = update.currentVersion && update.availableVersion
      ? ` · ${update.currentVersion} → ${update.availableVersion}`
      : update.availableVersion
      ? ` · ${update.availableVersion}`
      : "";
    return `• ${update.name}${version}`;
  });
  if (updates.length > limit) {
    lines.push(`• …and ${updates.length - limit} more`);
  }
  return lines.join("\n");
}

function updateAllPreview(
  aptUpdates: readonly SoftwareUpdate[],
  flatpakUpdates: readonly SoftwareUpdate[],
): string {
  const sections: string[] = [];
  if (aptUpdates.length > 0) {
    sections.push(`APT (${aptUpdates.length})\n${updateListPreview(aptUpdates, 5)}`);
  }
  if (flatpakUpdates.length > 0) {
    sections.push(
      `Flatpak (${flatpakUpdates.length})\n${updateListPreview(flatpakUpdates, 5)}`,
    );
  }
  sections.push("APT and Flatpak will run as independent transactions.");
  return sections.join("\n\n");
}

/** Reports independent APT and Flatpak outcomes with their diagnostics. */
function reportSourceResults(
  toast: Toast,
  aptFailure: OperationFailure | undefined,
  flatpakFailure: OperationFailure | undefined,
  titles: { success: string; successMessage: string; failure: string },
): void {
  const failures = [aptFailure, flatpakFailure].filter(Boolean);
  if (failures.length === 0) {
    reportOperationResult(toast, {
      status: "success",
      title: titles.success,
      message: titles.successMessage,
    });
    return;
  }
  reportOperationResult(toast, {
    status: "failure",
    title: failures.length > 1 ? titles.failure : failures[0]!.message,
    message: [
      ...updateSourceErrors(aptFailure, flatpakFailure),
      "Details in Recent Actions",
    ].join(" · "),
  });
}

/** The Recent Actions identity of a source-wide update. */
function sourceBatchRecord(
  source: SoftwareSource,
  updates: readonly SoftwareUpdate[],
): FailedActionRecord {
  const label = recentActionSource(source);
  return {
    name: `${label} updates`,
    identifier: updates.map((update) => update.id).join(", "),
    source: label,
  };
}

function recordBatchFailure(
  source: SoftwareSource,
  updates: readonly SoftwareUpdate[],
  failure: OperationFailure,
): Promise<void> {
  return recordRecentAction({
    ...sourceBatchRecord(source, updates),
    kind: "failed",
    summary: failure.message,
    details: failure.details,
  });
}
