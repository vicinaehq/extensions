import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  List,
  Toast,
  closeMainWindow,
  confirmAlert,
  environment,
  getPreferenceValues,
  open,
  openExtensionPreferences,
  showToast,
  trash,
} from "@vicinae/api";
import { useMemo, useRef, useState } from "react";
import {
  appImageKey,
  launchInstalledAppImage,
  removeInstalledAppImage,
  type AppImageLocations,
  type InstalledAppImage,
} from "./appimages.ts";
import { aptBackend } from "./backends/apt.ts";
import { appStreamBackend } from "./backends/appstream.ts";
import { FlatpakBackend } from "./backends/flatpak.ts";
import { ShowAppImageDetailsAction } from "./components/appimage-details.tsx";
import { ShowSoftwareDetailsAction } from "./components/software-details.tsx";
import { useInstalledSoftware } from "./hooks/use-installed-software.ts";
import { useInstalledAppImages } from "./hooks/use-installed-appimages.ts";
import { useSoftwareOperation } from "./hooks/use-software-operation.ts";
import {
  CancelRemovalAction,
  CheckForUpdateAction,
  LaunchAction,
  ManageCommonActions,
  OpenDepotUpdateAction,
  RemoveAction,
  showOperationFailure,
} from "./manage-actions.tsx";
import { recentActionSource, recordRecentAction } from "./recent-actions.ts";
import type { DepotPreferences, SoftwareItem } from "./types.ts";
import { launchInstalledApplication } from "./utils/installed-application.ts";
import {
  reportOperationFailure,
  reportOperationResult,
  showOperationBusy,
  updateOperationToast,
} from "./utils/operation-feedback.ts";
import { safeHomepageUrl } from "./utils/package-details.ts";
import {
  removeAccessories,
  softwareSourceLabel,
} from "./utils/software-accessories.ts";
import {
  findSoftwareUpdate,
  softwareItemKey,
  sortSoftwareAlphabetically,
} from "./utils/software-results.ts";

type InstalledEntry =
  | { kind: "package"; pkg: SoftwareItem }
  | { kind: "appimage"; appImage: InstalledAppImage };

export default function ManageCommand() {
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
  const appImages = useInstalledAppImages(environment.supportPath);
  const appImageLocations = useMemo<AppImageLocations>(
    () => ({ supportPath: environment.supportPath }),
    [],
  );
  const removing = useRef(new Set<string>());
  const checkingUpdates = useRef(new Set<string>());
  const [updatesFound, setUpdatesFound] = useState<ReadonlySet<string>>(new Set());
  const operation = useSoftwareOperation();
  const packages = sortSoftwareAlphabetically([
    ...installed.aptPackages,
    ...installed.flatpakPackages,
  ]);
  const entries = sortInstalledEntries(packages, appImages.appImages);
  const loadNotice = [
    installed.aptError,
    installed.flatpakError,
    appImages.error,
  ]
    .filter(Boolean).join(" ") || undefined;

  const removePackage = async (pkg: SoftwareItem) => {
    const source = softwareSourceLabel(pkg, "scope");
    if (pkg.source === "apt") {
      const previewToast = await showToast({
        style: Toast.Style.Animated,
        title: `Checking removal safety for ${pkg.name}`,
        message: "Running an APT simulation",
      });
      try {
        const preview = await aptBackend.previewRemoval(pkg);
        if (!preview) {
          installed.removeFromList(pkg);
          previewToast.style = Toast.Style.Success;
          previewToast.title = `${pkg.name} is not installed`;
          previewToast.message = pkg.id;
          await previewToast.update();
          return;
        }
        await previewToast.hide();
        if (preview.additionalIds.length > 0) {
          await confirmAlert({
            title: `Depot won't remove ${pkg.name}`,
            message: [
              "APT reports that this would also remove:",
              removalPackageList(preview.additionalIds),
              "Use APT directly if you intend to make this system-level change.",
            ].join("\n\n"),
            primaryAction: { title: "Keep Installed" },
          });
          return;
        }
      } catch (error) {
        await reportOperationFailure(
          previewToast,
          error,
          "Removal safety check failed",
          { message: pkg.id },
        );
        return;
      }
    }

    const confirmed = await confirmAlert({
      title: `Remove ${pkg.name}?`,
      message: [
        `Source: ${source}`,
        `ID: ${pkg.id}`,
        pkg.source === "apt"
          ? "APT simulation: no other installed packages will be removed."
          : undefined,
      ].filter(Boolean).join("\n"),
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
    if (removing.current.has(key)) {
      await showOperationBusy(`${pkg.name} is already being removed`);
      return;
    }
    removing.current.add(key);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Removing ${pkg.name}`,
      message: pkg.source === "apt" ? "Authenticate when prompted" : source,
    });
    const options = operation.start(
      key,
      (status) => updateOperationToast(toast, status),
    );

    try {
      const outcome = pkg.source === "apt"
        ? await aptBackend.remove(pkg, options)
        : await flatpakBackend.remove(pkg, options);
      installed.removeFromList(pkg);
      if (outcome === "removed") {
        await recordRecentAction({
          kind: "removed",
          name: pkg.name,
          identifier: pkg.id,
          source: recentActionSource(pkg.source),
        });
      }
      reportOperationResult(toast, {
        status: "success",
        title: outcome === "not-installed"
          ? `${pkg.name} is not installed`
          : `${pkg.name} removed`,
        message: pkg.id,
      });
    } catch (error) {
      await reportOperationFailure(toast, error, "Software removal failed", {
        message: pkg.id,
        recent: {
          name: pkg.name,
          identifier: pkg.id,
          source: recentActionSource(pkg.source),
        },
      });
    } finally {
      operation.finish(key);
      removing.current.delete(key);
    }
  };

  const launchPackage = async (pkg: SoftwareItem) => {
    try {
      await launchInstalledApplication(pkg);
      await closeMainWindow({ clearRootSearch: true });
    } catch (error) {
      await showOperationFailure(error, `Could not launch ${pkg.name}`, {
        message: pkg.id,
      });
    }
  };

  const checkForUpdate = async (pkg: SoftwareItem) => {
    const key = softwareItemKey(pkg);
    if (checkingUpdates.current.has(key)) return;
    checkingUpdates.current.add(key);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Checking ${pkg.name}`,
      message: `Querying ${recentActionSource(pkg.source)}`,
    });

    try {
      const [updates, nativeArchitecture] = pkg.source === "apt"
        ? await Promise.all([
          aptBackend.listUpdates(),
          aptBackend.getNativeArchitecture(),
        ])
        : [await flatpakBackend.listUpdates(), undefined];
      const update = findSoftwareUpdate(pkg, updates, nativeArchitecture);
      setUpdatesFound((current) => withKey(current, key, Boolean(update)));
      toast.style = Toast.Style.Success;
      // Package lists may be stale; only Depot Update refreshes them.
      toast.title = update
        ? `Update available for ${pkg.name}`
        : `No update for ${pkg.name} in the current package lists`;
      toast.message = update
        ? [update.availableVersion, "Open Depot Update to install it"]
          .filter(Boolean).join(" · ")
        : "Open Depot Update to refresh package metadata";
      await toast.update();
    } catch (error) {
      await reportOperationFailure(toast, error, "Update check failed", {
        message: pkg.id,
      });
    } finally {
      checkingUpdates.current.delete(key);
    }
  };

  const openHomepage = async (pkg: SoftwareItem) => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Finding ${pkg.name} homepage`,
    });
    try {
      const homepage = await resolveHomepage(pkg);
      if (!homepage) {
        toast.style = Toast.Style.Failure;
        toast.title = "Homepage unavailable";
        toast.message = `No trusted homepage is available for ${pkg.name}`;
        await toast.update();
        return;
      }
      await open(homepage);
      await toast.hide();
    } catch (error) {
      await reportOperationFailure(toast, error, "Homepage could not be opened", {
        message: pkg.id,
      });
    }
  };

  const launchAppImage = async (appImage: InstalledAppImage) => {
    try {
      await launchInstalledAppImage(appImage, appImageLocations);
      await closeMainWindow({ clearRootSearch: true });
    } catch (error) {
      await showOperationFailure(error, `Could not launch ${appImage.name}`, {
        message: appImage.fileName,
      });
    }
  };

  const removeAppImage = async (appImage: InstalledAppImage) => {
    const confirmed = await confirmAlert({
      title: `Remove ${appImage.name}?`,
      message: appImage.managedByDepot
        ? "The AppImage and integration files created by Depot will be moved to Trash. Application settings and data will remain."
        : "Only this AppImage file will be moved to Trash. Desktop entries, icons, settings, and data created by other tools will remain.",
      primaryAction: {
        title: "Move to Trash",
        style: Alert.ActionStyle.Destructive,
      },
      dismissAction: {
        title: "Cancel",
        style: Alert.ActionStyle.Cancel,
      },
    });
    if (!confirmed) return;

    const key = appImageKey(appImage);
    if (removing.current.has(key)) {
      await showOperationBusy(`${appImage.name} is already being removed`);
      return;
    }
    removing.current.add(key);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Removing ${appImage.name}`,
      message: "Moving AppImage to Trash",
    });

    try {
      await removeInstalledAppImage(appImage, {
        ...appImageLocations,
        moveToTrash: async (paths) => trash([...paths]),
      });
      appImages.removeFromList(appImage);
      await recordRecentAction({
        kind: "removed",
        name: appImage.name,
        identifier: appImage.filePath,
        source: "AppImage",
      });
      reportOperationResult(toast, {
        status: "success",
        title: `${appImage.name} moved to Trash`,
        message: appImage.managedByDepot
          ? "Depot integration files were included"
          : "External integration files were left untouched",
      });
    } catch (error) {
      await reportOperationFailure(toast, error, "AppImage removal failed", {
        message: appImage.fileName,
        recent: {
          name: appImage.name,
          identifier: appImage.filePath,
          source: "AppImage",
        },
      });
    } finally {
      removing.current.delete(key);
    }
  };

  const refresh = () => {
    installed.refresh();
    appImages.refresh();
  };

  return (
    <List
      isLoading={installed.isLoading || appImages.isLoading}
      searchBarPlaceholder="Search installed applications..."
      actions={
        <ActionPanel>
          <ManageCommonActions onRefresh={refresh} />
        </ActionPanel>
      }
    >
      {entries.length > 0 && (
        <List.Section title="Installed Applications" subtitle={loadNotice}>
          {entries.map((entry) => entry.kind === "package" ? (
            <InstalledItem
              key={softwareItemKey(entry.pkg)}
              pkg={entry.pkg}
              updateAvailable={updatesFound.has(softwareItemKey(entry.pkg))}
              onLaunch={() => launchPackage(entry.pkg)}
              onCheckForUpdate={() => checkForUpdate(entry.pkg)}
              onOpenHomepage={() => openHomepage(entry.pkg)}
              onRemove={() => removePackage(entry.pkg)}
              onCancel={operation.isCancellable(softwareItemKey(entry.pkg))
                ? () => operation.cancel(softwareItemKey(entry.pkg))
                : undefined}
              onRefresh={refresh}
            />
          ) : (
            <InstalledAppImageItem
              key={appImageKey(entry.appImage)}
              appImage={entry.appImage}
              locations={appImageLocations}
              onLaunch={() => launchAppImage(entry.appImage)}
              onRemove={() => removeAppImage(entry.appImage)}
              onRefresh={refresh}
            />
          ))}
        </List.Section>
      )}

      {entries.length === 0 && !installed.isLoading && !appImages.isLoading && (
        <InstalledSoftwareEmptyView
          aptEnabled={aptEnabled}
          flatpakEnabled={flatpakEnabled}
          error={loadNotice}
          onRefresh={refresh}
        />
      )}
    </List>
  );
}

function InstalledItem({
  pkg,
  updateAvailable,
  onLaunch,
  onCheckForUpdate,
  onOpenHomepage,
  onRemove,
  onCancel,
  onRefresh,
}: {
  pkg: SoftwareItem;
  updateAvailable: boolean;
  onLaunch(): void;
  onCheckForUpdate(): void;
  onOpenHomepage(): void;
  onRemove(): void;
  onCancel?: () => void;
  onRefresh(): void;
}) {
  const source = softwareSourceLabel(pkg, "scope");
  const canLaunch = Boolean(pkg.desktopEntry);
  const detailActions = (
    <>
      {canLaunch && <LaunchAction onLaunch={onLaunch} />}
      <CheckForUpdateAction onCheck={onCheckForUpdate} />
      <RemoveAction onRemove={onRemove} />
      {onCancel && <CancelRemovalAction onCancel={onCancel} />}
    </>
  );

  return (
    <List.Item
      id={softwareItemKey(pkg)}
      title={pkg.name}
      subtitle={pkg.description}
      keywords={[
        pkg.id,
        source,
        pkg.flatpak?.remote ?? "",
        pkg.desktopEntry?.id ?? "",
      ]}
      accessories={updateAvailable
        ? [{ tag: "Update Available" }, ...removeAccessories(pkg)]
        : removeAccessories(pkg)}
      actions={
        <ActionPanel>
          {canLaunch && <LaunchAction onLaunch={onLaunch} />}
          {updateAvailable && <OpenDepotUpdateAction />}
          {onCancel && <CancelRemovalAction onCancel={onCancel} />}
          <ShowSoftwareDetailsAction
            pkg={pkg}
            primaryActions={detailActions}
          />
          <CheckForUpdateAction onCheck={onCheckForUpdate} />
          {!updateAvailable && <OpenDepotUpdateAction />}
          <Action
            title="Open Homepage"
            icon={Icon.Globe01}
            onAction={onOpenHomepage}
          />
          {pkg.source === "apt" ? (
            <Action.CopyToClipboard
              title="Copy Package ID"
              content={pkg.id}
            />
          ) : (
            <Action.CopyToClipboard
              title="Copy Application ID"
              content={pkg.id}
            />
          )}
          {pkg.source === "apt" && pkg.desktopEntry && (
            <Action.CopyToClipboard
              title="Copy Desktop Entry ID"
              content={pkg.desktopEntry.id}
            />
          )}
          {pkg.installationPath && (
            <Action.ShowInFinder
              title="Open Installation Location"
              path={pkg.installationPath}
            />
          )}
          {pkg.source === "apt" && pkg.desktopEntry && (
            <Action.ShowInFinder
              title="Open Desktop Entry Location"
              path={pkg.desktopEntry.filePath}
              select
            />
          )}
          <RemoveAction onRemove={onRemove} />
          <ManageCommonActions onRefresh={onRefresh} />
        </ActionPanel>
      }
    />
  );
}

function InstalledAppImageItem({
  appImage,
  locations,
  onLaunch,
  onRemove,
  onRefresh,
}: {
  appImage: InstalledAppImage;
  locations: AppImageLocations;
  onLaunch(): void;
  onRemove(): void;
  onRefresh(): void;
}) {
  const detailActions = (
    <>
      <LaunchAction onLaunch={onLaunch} />
      <RemoveAction title="Remove AppImage" onRemove={onRemove} />
    </>
  );

  return (
    <List.Item
      id={appImageKey(appImage)}
      title={appImage.name}
      subtitle={appImage.description}
      icon={appImage.iconPath
        ? { source: appImage.iconPath, fallback: Icon.AppWindow }
        : Icon.AppWindow}
      keywords={[appImage.fileName, appImage.filePath, "AppImage"]}
      accessories={[
        { text: appImage.fileName },
        { tag: appImage.managedByDepot ? "AppImage · Depot" : "AppImage · External" },
      ]}
      actions={
        <ActionPanel>
          <LaunchAction onLaunch={onLaunch} />
          <ShowAppImageDetailsAction
            appImage={appImage}
            locations={locations}
            primaryActions={detailActions}
          />
          <Action.ShowInFinder
            title="Open AppImage Location"
            path={appImage.filePath}
            select
          />
          <Action.CopyToClipboard
            title="Copy AppImage Path"
            content={appImage.filePath}
          />
          <RemoveAction title="Remove AppImage" onRemove={onRemove} />
          <ManageCommonActions onRefresh={onRefresh} />
        </ActionPanel>
      }
    />
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
  const packageSourcesEnabled = aptEnabled || flatpakEnabled;
  let icon = Icon.AppWindow;
  let title = "No installed applications found";
  let description = "No APT, Flatpak, or ~/Applications AppImage entries were found";

  if (error) {
    icon = Icon.XMarkCircle;
    title = "Installed applications could not be loaded";
    description = error;
  } else if (!packageSourcesEnabled) {
    description = "Enable APT or Flatpak in preferences, or add an AppImage to ~/Applications";
  }

  return (
    <List.EmptyView
      icon={icon}
      title={title}
      description={description}
      actions={
        <ActionPanel>
          <ManageCommonActions onRefresh={onRefresh} />
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

function sortInstalledEntries(
  packages: readonly SoftwareItem[],
  appImages: readonly InstalledAppImage[],
): InstalledEntry[] {
  return [
    ...packages.map((pkg): InstalledEntry => ({ kind: "package", pkg })),
    ...appImages.map((appImage): InstalledEntry => ({
      kind: "appimage",
      appImage,
    })),
  ].sort((left, right) => {
    const leftName = left.kind === "package" ? left.pkg.name : left.appImage.name;
    const rightName = right.kind === "package" ? right.pkg.name : right.appImage.name;
    return leftName.localeCompare(rightName, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

async function resolveHomepage(pkg: SoftwareItem): Promise<string | undefined> {
  const knownHomepage = safeHomepageUrl(pkg.homepage);
  if (knownHomepage) return knownHomepage;

  if (pkg.source === "apt") {
    const details = await aptBackend.getDetails(pkg.id);
    return safeHomepageUrl(details.homepage);
  }

  const components = await appStreamBackend.getDetails(pkg.id);
  const component = components.find((candidate) =>
    candidate.flatpakId === pkg.id || candidate.id === pkg.id
  );
  return safeHomepageUrl(component?.homepage);
}

function withKey(
  current: ReadonlySet<string>,
  key: string,
  present: boolean,
): ReadonlySet<string> {
  if (current.has(key) === present) return current;
  const next = new Set(current);
  if (present) next.add(key);
  else next.delete(key);
  return next;
}

function removalPackageList(ids: readonly string[], limit = 10): string {
  const visible = ids.slice(0, limit).map((id) => `• ${id}`);
  if (ids.length > limit) visible.push(`• …and ${ids.length - limit} more`);
  return visible.join("\n");
}
