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
import { AptOperationError, aptBackend } from "./backends/apt";
import {
  FlatpakBackend,
  FlatpakOperationError,
} from "./backends/flatpak";
import { ShowSoftwareDetailsAction } from "./components/software-details";
import { useSoftwareUpdates } from "./hooks/use-software-updates";
import type { SoftwarePreferences, SoftwareUpdate } from "./types";
import {
  sourceLabel,
  updateAccessories,
} from "./utils/software-accessories";
import { sortSoftwareAlphabetically } from "./utils/software-results";

export default function UpdateCommand() {
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<SoftwarePreferences>();
  const flatpakBackend = useMemo(
    () => new FlatpakBackend(flatpakScope),
    [flatpakScope],
  );
  const updates = useSoftwareUpdates(
    flatpakBackend,
    aptEnabled,
    flatpakEnabled,
  );
  const activeOperations = useRef(new Set<string>());
  const availableUpdates = sortSoftwareAlphabetically([
    ...updates.aptUpdates,
    ...updates.flatpakUpdates,
  ]);
  const totalUpdates = availableUpdates.length;

  const updateOne = async (update: SoftwareUpdate) => {
    const key = updateKey(update);
    if (activeOperations.current.has(key)) return;
    activeOperations.current.add(key);

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
      updates.forget(update);
      updates.reload();
      toast.style = Toast.Style.Success;
      toast.title = `${update.name} updated`;
      toast.message = update.availableVersion ?? update.id;
    } catch (error) {
      console.error(`Failed to update ${update.id}`, error);
      toast.style = Toast.Style.Failure;
      toast.title = operationErrorMessage(error, "Software update failed");
      toast.message = update.id;
    } finally {
      activeOperations.current.delete(key);
    }
  };

  const updateAll = async () => {
    if (totalUpdates === 0 || activeOperations.current.has("all")) return;
    const confirmed = await confirmAlert({
      title: `Update ${totalUpdates} software item${totalUpdates === 1 ? "" : "s"}?`,
      message: `APT: ${updates.aptUpdates.length}\nFlatpak: ${updates.flatpakUpdates.length}`,
      primaryAction: { title: "Update All" },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    });
    if (!confirmed) return;

    activeOperations.current.add("all");
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Updating software",
      message: "Authenticate when prompted",
    });
    const failures: string[] = [];

    try {
      if (updates.aptUpdates.length > 0) {
        try {
          await aptBackend.updateAll();
        } catch (error) {
          console.error("APT update failed", error);
          failures.push(operationErrorMessage(error, "APT update failed"));
        }
      }
      if (updates.flatpakUpdates.length > 0) {
        try {
          await flatpakBackend.updateAll();
        } catch (error) {
          console.error("Flatpak update failed", error);
          failures.push(operationErrorMessage(error, "Flatpak update failed"));
        }
      }

      updates.reload();
      if (failures.length === 0) {
        toast.style = Toast.Style.Success;
        toast.title = "Software update completed";
        toast.message = "Checking for remaining updates";
      } else {
        toast.style = Toast.Style.Failure;
        toast.title = failures.length > 1 ? "Software updates failed" : failures[0]!;
        toast.message = "Successful sources were updated; check the refreshed list";
      }
    } finally {
      activeOperations.current.delete("all");
    }
  };

  const refreshMetadata = async () => {
    if (activeOperations.current.has("refresh")) return;
    activeOperations.current.add("refresh");
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

    updates.reload();
    activeOperations.current.delete("refresh");
    if (failures.length === 0) {
      toast.style = Toast.Style.Success;
      toast.title = "Software metadata refreshed";
      toast.message = "Checking for updates";
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = failures.length > 1 ? "Metadata refresh failed" : failures[0]!;
      toast.message = "Available cached metadata will still be shown";
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
      {availableUpdates.map((update) => (
        <UpdateItem
          key={updateKey(update)}
          update={update}
          onUpdate={() => updateOne(update)}
          sharedActions={sharedActions}
        />
      ))}

      {totalUpdates === 0 && !updates.isLoading && (
        <List.EmptyView
          icon={updates.aptError || updates.flatpakError
            ? Icon.XMarkCircle
            : aptEnabled || flatpakEnabled
              ? Icon.CheckCircle
              : Icon.Cog}
          title={!aptEnabled && !flatpakEnabled
            ? "No package sources enabled"
            : updates.aptError || updates.flatpakError
              ? "Updates could not be loaded"
              : "Software is up to date"}
          description={!aptEnabled && !flatpakEnabled
            ? "Enable APT or Flatpak in the extension preferences"
            : updates.aptError ?? updates.flatpakError ??
              "Using currently cached package metadata"}
          actions={
            <ActionPanel>
              {(aptEnabled || flatpakEnabled) && sharedActions}
              <Action
                title="Open Extension Preferences"
                icon={Icon.Cog}
                onAction={() => openExtensionPreferences()}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
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
  const source = sourceLabel(update, "scope");

  return (
    <List.Item
      id={updateKey(update)}
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

function updateKey(update: SoftwareUpdate): string {
  return `${update.source}:${update.flatpak?.scope ?? "system"}:${update.id}`;
}

function operationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof AptOperationError || error instanceof FlatpakOperationError
    ? error.message
    : fallback;
}
