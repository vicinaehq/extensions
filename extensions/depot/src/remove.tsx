import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  List,
  Toast,
  confirmAlert,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
} from "@vicinae/api";
import { useMemo, useRef } from "react";
import { aptBackend } from "./backends/apt";
import { FlatpakBackend } from "./backends/flatpak";
import { ShowSoftwareDetailsAction } from "./components/software-details";
import {
  isOperationCancelled,
  operationErrorMessage,
} from "./errors.ts";
import { useInstalledSoftware } from "./hooks/use-installed-software";
import type { DepotPreferences, SoftwareItem } from "./types";
import {
  removeAccessories,
  softwareSourceLabel,
} from "./utils/software-accessories";
import {
  softwareItemKey,
  sortSoftwareAlphabetically,
} from "./utils/software-results";

export default function RemoveCommand() {
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<DepotPreferences>();
  const flatpakBackend = useMemo(
    () => new FlatpakBackend(flatpakScope),
    [flatpakScope],
  );
  const installed = useInstalledSoftware(
    flatpakBackend,
    aptEnabled,
    flatpakEnabled,
  );
  const removing = useRef(new Set<string>());
  const packages = sortSoftwareAlphabetically([
    ...installed.aptPackages,
    ...installed.flatpakPackages,
  ]);

  const remove = async (pkg: SoftwareItem) => {
    const source = softwareSourceLabel(pkg, "scope");
    const confirmed = await confirmAlert({
      title: `Remove ${pkg.name}?`,
      message: `Source: ${source}\nID: ${pkg.id}`,
      primaryAction: {
        title: "Remove",
        style: Alert.ActionStyle.Destructive,
      },
      dismissAction: {
        title: "Cancel",
        style: Alert.ActionStyle.Cancel,
      },
    });
    if (!confirmed) return;

    const key = softwareItemKey(pkg);
    if (removing.current.has(key)) return;
    removing.current.add(key);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Removing ${pkg.name}`,
      message: pkg.source === "apt" ? "Authenticate when prompted" : source,
    });

    try {
      const outcome = pkg.source === "apt"
        ? await aptBackend.remove(pkg)
        : await flatpakBackend.remove(pkg);
      installed.removeFromList(pkg);
      toast.style = Toast.Style.Success;
      toast.title = outcome === "not-installed"
        ? `${pkg.name} is not installed`
        : `${pkg.name} removed`;
      toast.message = pkg.id;
    } catch (error) {
      if (isOperationCancelled(error)) {
        await toast.hide();
        return;
      }
      console.error(`Failed to remove ${pkg.id}`, error);
      toast.style = Toast.Style.Failure;
      toast.title = operationErrorMessage(error, "Software removal failed");
      toast.message = pkg.id;
    } finally {
      removing.current.delete(key);
    }
  };

  return (
    <List
      isLoading={installed.isLoading}
      searchBarPlaceholder="Search installed applications..."
    >
      {packages.map((pkg) => (
        <InstalledItem
          key={softwareItemKey(pkg)}
          pkg={pkg}
          onRemove={() => remove(pkg)}
          onRefresh={installed.refresh}
        />
      ))}

      {packages.length === 0 && !installed.isLoading && (
        <InstalledSoftwareEmptyView
          aptEnabled={aptEnabled}
          flatpakEnabled={flatpakEnabled}
          error={installed.aptError ?? installed.flatpakError}
          onRefresh={installed.refresh}
        />
      )}
    </List>
  );
}

function InstalledSoftwareEmptyView({
  aptEnabled,
  flatpakEnabled,
  error,
  onRefresh,
}: {
  aptEnabled: boolean;
  flatpakEnabled: boolean;
  error?: string;
  onRefresh(): void;
}) {
  const sourcesEnabled = aptEnabled || flatpakEnabled;
  let icon = Icon.AppWindow;
  let title = "No removable applications found";
  let description = "Only conservative APT application candidates and Flatpak apps are shown";

  if (!sourcesEnabled) {
    icon = Icon.Cog;
    title = "No package sources enabled";
    description = "Enable APT or Flatpak in the extension preferences";
  } else if (error) {
    icon = Icon.XMarkCircle;
    title = "Installed applications could not be loaded";
    description = error;
  }

  return (
    <List.EmptyView
      icon={icon}
      title={title}
      description={description}
      actions={
        <ActionPanel>
          {sourcesEnabled && (
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              onAction={onRefresh}
            />
          )}
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

function InstalledItem({
  pkg,
  onRemove,
  onRefresh,
}: {
  pkg: SoftwareItem;
  onRemove(): void;
  onRefresh(): void;
}) {
  const source = softwareSourceLabel(pkg, "scope");

  return (
    <List.Item
      id={softwareItemKey(pkg)}
      title={pkg.name}
      subtitle={pkg.description}
      keywords={[pkg.id, source, pkg.flatpak?.remote ?? ""]}
      accessories={removeAccessories(pkg)}
      actions={
        <ActionPanel>
          <RemoveAction onRemove={onRemove} />
          <ShowSoftwareDetailsAction
            pkg={pkg}
            primaryActions={<RemoveAction onRemove={onRemove} />}
          />
          <Action.CopyToClipboard title="Copy Package ID" content={pkg.id} />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={onRefresh}
          />
        </ActionPanel>
      }
    />
  );
}

function RemoveAction({ onRemove }: { onRemove(): void }) {
  return (
    <Action
      title="Remove"
      icon={Icon.Trash}
      style={Action.Style.Destructive}
      onAction={onRemove}
    />
  );
}
