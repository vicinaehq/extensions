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
import { aptBackend } from "./backends/apt";
import {
  FlatpakBackend,
  FlatpakOperationError,
} from "./backends/flatpak";
import { ShowSoftwareDetailsAction } from "./components/software-details";
import {
  isOperationCancelled,
  operationErrorMessage,
} from "./errors.ts";
import { useSoftwareUpdates } from "./hooks/use-software-updates";
import type { DepotPreferences, SoftwareUpdate } from "./types";
import {
  softwareSourceLabel,
  updateAccessories,
} from "./utils/software-accessories";
import {
  softwareItemKey,
  sortSoftwareAlphabetically,
} from "./utils/software-results";
import { OperationLock } from "./utils/operation-lock";
import { reportOperationResult } from "./utils/operation-feedback";
import { updateSourceErrors } from "./utils/update-errors";

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
  const availableUpdates = sortSoftwareAlphabetically([
    ...updates.aptUpdates,
    ...updates.flatpakUpdates,
  ]);
  const totalUpdates = availableUpdates.length;
  const sourceErrors = updateSourceErrors(
    updates.aptError,
    updates.flatpakError,
  );

  const updateOne = async (update: SoftwareUpdate) => {
    const key = softwareItemKey(update);
    if (!operationLock.tryAcquire(key)) return;

    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Updating ${update.name}`,
        message: update.source === "apt"
          ? "Authenticate when prompted"
          : `Flatpak · ${update.flatpak?.scope ?? "unknown"}`,
      });

      try {
        if (update.source === "apt") await aptBackend.update(update);
        else await flatpakBackend.update(update);
        updates.removeFromList(update);
        updates.refresh();
        reportOperationResult(toast, {
          status: "success",
          title: `${update.name} updated`,
          message: update.availableVersion ?? update.id,
        });
      } catch (error) {
        if (isOperationCancelled(error)) {
          await toast.hide();
          return;
        }
        console.error(`Failed to update ${update.id}`, error);
        reportOperationResult(toast, {
          status: "failure",
          title: operationErrorMessage(error, "Software update failed"),
          message: update.id,
        });
      }
    } finally {
      operationLock.release(key);
    }
  };

  const updateAll = async () => {
    if (totalUpdates === 0 || !operationLock.tryAcquire("all")) return;

    try {
      const confirmed = await confirmAlert({
        title: `Update ${totalUpdates} software item${totalUpdates === 1 ? "" : "s"}?`,
        message: `APT: ${updates.aptUpdates.length}\nFlatpak: ${updates.flatpakUpdates.length}`,
        primaryAction: { title: "Update All" },
        dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
      });
      if (!confirmed) return;

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Updating software",
        message: "Authenticate when prompted",
      });
      const failures: string[] = [];

      if (updates.aptUpdates.length > 0) {
        try {
          await aptBackend.updateAll();
        } catch (error) {
          if (isOperationCancelled(error)) {
            await toast.hide();
            return;
          }
          console.error("APT update failed", error);
          failures.push(operationErrorMessage(error, "APT update failed"));
        }
      }
      if (updates.flatpakUpdates.length > 0) {
        try {
          await flatpakBackend.updateAll();
        } catch (error) {
          if (isOperationCancelled(error)) {
            await toast.hide();
            return;
          }
          console.error("Flatpak update failed", error);
          failures.push(operationErrorMessage(error, "Flatpak update failed"));
        }
      }

      updates.refresh();
      if (failures.length === 0) {
        reportOperationResult(toast, {
          status: "success",
          title: "Software update completed",
          message: "Checking for remaining updates",
        });
      } else {
        reportOperationResult(toast, {
          status: "failure",
          title: failures.length > 1 ? "Software updates failed" : failures[0]!,
          message: "Successful sources were updated; check the refreshed list",
        });
      }
    } finally {
      operationLock.release("all");
    }
  };

  const refreshMetadata = async () => {
    if (!operationLock.tryAcquire("refresh")) return;

    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Refreshing software metadata",
        message: aptEnabled
          ? "Authenticate for APT when prompted"
          : "Refreshing configured Flatpak remotes",
      });

      const refreshes: Promise<void>[] = [];
      if (aptEnabled) refreshes.push(aptBackend.refreshMetadata());
      if (flatpakEnabled) refreshes.push(flatpakBackend.refreshMetadata());
      const results = await Promise.allSettled(refreshes);
      if (results.some((result) =>
        result.status === "rejected" && isOperationCancelled(result.reason)
      )) {
        updates.refresh();
        await toast.hide();
        return;
      }
      const failures = results.flatMap((result) => {
        if (result.status === "fulfilled") return [];
        if (
          result.reason instanceof FlatpakOperationError &&
          result.reason.kind === "unavailable"
        ) {
          return [];
        }
        console.error("Metadata refresh failed", result.reason);
        return [operationErrorMessage(result.reason, "Metadata refresh failed")];
      });

      updates.refresh();
      if (failures.length === 0) {
        reportOperationResult(toast, {
          status: "success",
          title: "Software metadata refreshed",
          message: "Checking for updates",
        });
      } else {
        reportOperationResult(toast, {
          status: "failure",
          title: failures.length > 1 ? "Metadata refresh failed" : failures[0]!,
          message: "Available cached metadata will still be shown",
        });
      }
    } finally {
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
      {(aptEnabled || flatpakEnabled) && (
        <Action
          title="Refresh Package Metadata"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={refreshMetadata}
        />
      )}
    </>
  );

  return (
    <List
      isLoading={updates.isLoading}
      searchBarPlaceholder="Search available updates..."
      actions={<ActionPanel>{sharedActions}</ActionPanel>}
    >
      {totalUpdates > 0 && sourceErrors.length > 0 && (
        <List.Item
          id="update-source-errors"
          title="Some update sources could not be checked"
          subtitle={sourceErrors.join(" · ")}
          actions={<ActionPanel>{sharedActions}</ActionPanel>}
        />
      )}

      {availableUpdates.map((update) => (
        <UpdateItem
          key={softwareItemKey(update)}
          update={update}
          onUpdate={() => updateOne(update)}
          sharedActions={sharedActions}
        />
      ))}

      {totalUpdates === 0 && !updates.isLoading && (
        <UpdatesEmptyView
          aptEnabled={aptEnabled}
          flatpakEnabled={flatpakEnabled}
          error={updates.aptError ?? updates.flatpakError}
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
    title = "Updates could not be loaded";
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
  sharedActions,
}: {
  update: SoftwareUpdate;
  onUpdate(): void;
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
          <ShowSoftwareDetailsAction
            pkg={update}
            primaryActions={
              <>
                <UpdateAction onUpdate={onUpdate} />
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

function UpdateAction({ onUpdate }: { onUpdate(): void }) {
  return (
    <Action
      title="Update"
      icon={Icon.Download}
      onAction={onUpdate}
    />
  );
}
