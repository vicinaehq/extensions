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
import { AptOperationError, aptBackend } from "./backends/apt";
import {
  FlatpakBackend,
  FlatpakOperationError,
} from "./backends/flatpak";
import { ShowSoftwareDetailsAction } from "./components/software-details";
import { useInstalledSoftware } from "./hooks/use-installed-software";
import type { SoftwarePackage, SoftwarePreferences } from "./types";
import {
  removeAccessories,
  sourceLabel,
} from "./utils/software-accessories";
import { sortSoftwareAlphabetically } from "./utils/software-results";

export default function RemoveCommand() {
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<SoftwarePreferences>();
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

  const remove = async (pkg: SoftwarePackage) => {
    const source = sourceLabel(pkg, "scope");
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

    const key = `${pkg.source}:${pkg.flatpak?.scope ?? "system"}:${pkg.id}`;
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
      installed.forget(pkg);
      toast.style = Toast.Style.Success;
      toast.title = outcome === "not-installed"
        ? `${pkg.name} is not installed`
        : `${pkg.name} removed`;
      toast.message = pkg.id;
    } catch (error) {
      console.error(`Failed to remove ${pkg.id}`, error);
      toast.style = Toast.Style.Failure;
      toast.title = error instanceof AptOperationError ||
          error instanceof FlatpakOperationError
        ? error.message
        : "Software removal failed";
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
          key={`${pkg.source}:${pkg.flatpak?.scope ?? "system"}:${pkg.id}`}
          pkg={pkg}
          onRemove={() => remove(pkg)}
          onRefresh={installed.refresh}
        />
      ))}

      {packages.length === 0 && !installed.isLoading && (
        <List.EmptyView
          icon={installed.aptError || installed.flatpakError
            ? Icon.XMarkCircle
            : aptEnabled || flatpakEnabled
              ? Icon.AppWindow
              : Icon.Cog}
          title={!aptEnabled && !flatpakEnabled
            ? "No package sources enabled"
            : installed.aptError || installed.flatpakError
              ? "Installed applications could not be loaded"
              : "No removable applications found"}
          description={!aptEnabled && !flatpakEnabled
            ? "Enable APT or Flatpak in the extension preferences"
            : installed.aptError ?? installed.flatpakError ??
              "Only conservative APT application candidates and Flatpak apps are shown"}
          actions={
            <ActionPanel>
              {(aptEnabled || flatpakEnabled) && (
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  onAction={installed.refresh}
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
      )}
    </List>
  );
}

function InstalledItem({
  pkg,
  onRemove,
  onRefresh,
}: {
  pkg: SoftwarePackage;
  onRemove(): void;
  onRefresh(): void;
}) {
  const source = sourceLabel(pkg, "scope");

  return (
    <List.Item
      id={`${pkg.source}:${pkg.flatpak?.scope ?? "system"}:${pkg.id}`}
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
