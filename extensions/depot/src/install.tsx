import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
} from "@vicinae/api";
import { useMemo, useRef, useState } from "react";
import { aptBackend } from "./backends/apt";
import { enrichSoftwareItems } from "./backends/appstream-parsing";
import { FlatpakBackend } from "./backends/flatpak";
import { ShowSoftwareDetailsAction } from "./components/software-details";
import { RecentActionsAction } from "./components/recent-actions";
import {
  isOperationCancelled,
  operationErrorMessage,
} from "./errors.ts";
import { useAppStreamSearch } from "./hooks/use-appstream-search";
import { useAptSearch } from "./hooks/use-apt-search";
import { useFlatpakSearch } from "./hooks/use-flatpak-search";
import { useSoftwareOperation } from "./hooks/use-software-operation";
import type { DepotPreferences, SoftwareItem } from "./types";
import { recordRecentAction } from "./recent-actions";
import {
  reportOperationResult,
  updateOperationToast,
} from "./utils/operation-feedback";
import { installAccessories } from "./utils/software-accessories";
import {
  rankSoftwareResults,
  softwareItemKey,
} from "./utils/software-results";

export default function InstallCommand() {
  const [searchText, setSearchText] = useState("");
  const installing = useRef(new Set<string>());
  const operation = useSoftwareOperation();
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<DepotPreferences>();
  const flatpakBackend = useMemo(
    () => new FlatpakBackend(flatpakScope),
    [flatpakScope],
  );
  const aptSearch = useAptSearch(searchText, aptEnabled);
  const flatpakSearch = useFlatpakSearch(
    searchText,
    flatpakBackend,
    flatpakEnabled,
  );
  const appStreamComponents = useAppStreamSearch(
    searchText,
    aptEnabled || flatpakEnabled,
  );
  const results = rankSoftwareResults(
    searchText,
    enrichSoftwareItems(aptSearch.results, appStreamComponents),
    enrichSoftwareItems(flatpakSearch.results, appStreamComponents),
  );
  const isLoading = aptSearch.isLoading || flatpakSearch.isLoading;
  const normalizedQuery = searchText.trim();
  const searchNotice = [
    aptSearch.error,
    flatpakSearch.error,
    flatpakSearch.warning,
  ].filter((value): value is string => Boolean(value)).join(" ") || undefined;

  const install = async (pkg: SoftwareItem) => {
    const installKey = softwareItemKey(pkg);
    if (installing.current.has(installKey)) return;
    installing.current.add(installKey);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Installing ${pkg.id}`,
      message: pkg.source === "apt"
        ? "Authenticate when prompted"
        : `Flatpak · ${pkg.flatpak?.scope ?? flatpakScope}`,
    });
    const options = operation.start(
      installKey,
      (status) => updateOperationToast(toast, status),
    );

    try {
      const outcome = pkg.source === "apt"
        ? await aptBackend.install(pkg, options)
        : await flatpakBackend.install(pkg, options);
      if (pkg.source === "apt") aptSearch.markInstalled(pkg.id);
      else flatpakSearch.markInstalled(pkg.id);
      if (outcome === "installed") {
        await recordRecentAction({
          kind: "installed",
          name: pkg.name,
          identifier: pkg.id,
          source: pkg.source === "apt" ? "APT" : "Flatpak",
        });
      }
      reportOperationResult(toast, {
        status: "success",
        title: outcome === "already-installed"
          ? `${pkg.id} is already installed`
          : `${pkg.id} installed`,
        message: pkg.source === "apt"
          ? "APT installation completed"
          : "Flatpak installation completed",
      });
    } catch (installError) {
      if (isOperationCancelled(installError)) {
        await toast.hide();
        return;
      }
      console.error(`Failed to install ${pkg.id}`, installError);
      reportOperationResult(toast, {
        status: "failure",
        title: operationErrorMessage(
          installError,
          "Software installation failed",
        ),
        message: pkg.id,
      });
    } finally {
      operation.finish(installKey);
      installing.current.delete(installKey);
    }
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={searchPlaceholder(aptEnabled, flatpakEnabled)}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      actions={<ActionPanel><RecentActionsAction /></ActionPanel>}
    >
      {results.length > 0 && (
        <List.Section title="Search Results" subtitle={searchNotice}>
          {results.map((pkg) => (
            <List.Item
              key={softwareItemKey(pkg)}
              id={softwareItemKey(pkg)}
              title={pkg.name}
              subtitle={pkg.description}
              icon={pkg.icon
                ? { source: pkg.icon, fallback: Icon.AppWindow }
                : Icon.AppWindow}
              keywords={[pkg.id, pkg.appstream?.componentId ?? ""]}
              accessories={installAccessories(pkg)}
              actions={
                <ActionPanel>
                  {!pkg.installed && (
                    <Action
                      title="Install"
                      icon={Icon.Download}
                      onAction={() => install(pkg)}
                    />
                  )}
                  {operation.isCancellable(softwareItemKey(pkg)) && (
                    <CancelInstallAction
                      onCancel={() => operation.cancel(softwareItemKey(pkg))}
                    />
                  )}
                  <ShowSoftwareDetailsAction
                    pkg={pkg}
                    primaryActions={!pkg.installed
                      ? (<>
                        <Action
                          title="Install"
                          icon={Icon.Download}
                          onAction={() => install(pkg)}
                        />
                        {operation.isCancellable(softwareItemKey(pkg)) && (
                          <CancelInstallAction
                            onCancel={() => operation.cancel(softwareItemKey(pkg))}
                          />
                        )}
                      </>)
                      : undefined}
                  />
                  <Action.CopyToClipboard
                    title="Copy Package ID"
                    content={pkg.id}
                  />
                  <RecentActionsAction />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      <SearchEmptyView
        query={normalizedQuery}
        isLoading={isLoading}
        aptError={aptSearch.error}
        flatpakError={flatpakSearch.error}
        resultCount={results.length}
        aptEnabled={aptEnabled}
        flatpakEnabled={flatpakEnabled}
      />
    </List>
  );
}

function CancelInstallAction({ onCancel }: { onCancel(): void }) {
  return (
    <Action
      title="Cancel Installation"
      icon={Icon.XMarkCircle}
      style={Action.Style.Destructive}
      shortcut={{ modifiers: ["ctrl"], key: "x" }}
      onAction={onCancel}
    />
  );
}

function SearchEmptyView({
  query,
  isLoading,
  aptError,
  flatpakError,
  resultCount,
  aptEnabled,
  flatpakEnabled,
}: {
  query: string;
  isLoading: boolean;
  aptError?: string;
  flatpakError?: string;
  resultCount: number;
  aptEnabled: boolean;
  flatpakEnabled: boolean;
}) {
  if (resultCount > 0) return null;

  if (!aptEnabled && !flatpakEnabled) {
    return (
      <List.EmptyView
        icon={Icon.Cog}
        title="No package sources enabled"
        description="Enable APT or Flatpak in the extension preferences"
        actions={
          <ActionPanel>
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

  const errors = [aptError, flatpakError].filter(
    (value): value is string => Boolean(value),
  );
  const enabledSourceCount = Number(aptEnabled) + Number(flatpakEnabled);
  if (errors.length === enabledSourceCount) {
    return (
      <List.EmptyView
        icon={Icon.XMarkCircle}
        title="Software search unavailable"
        description={errors.join(" ")}
      />
    );
  }

  if (query.length < 2) {
    return (
      <List.EmptyView
        icon={Icon.MagnifyingGlass}
        title={`Start typing to search ${sourceNames(aptEnabled, flatpakEnabled)}`}
        description="Enter at least 2 characters"
      />
    );
  }

  if (isLoading) return null;

  return (
    <List.EmptyView
      icon={Icon.MagnifyingGlass}
      title="No software found"
      description={errors[0] ?? "Try a different application name or description"}
    />
  );
}

function sourceNames(aptEnabled: boolean, flatpakEnabled: boolean): string {
  if (aptEnabled && flatpakEnabled) return "APT and Flatpak";
  return aptEnabled ? "APT" : "Flatpak";
}

function searchPlaceholder(aptEnabled: boolean, flatpakEnabled: boolean): string {
  if (!aptEnabled && !flatpakEnabled) return "Enable a package source...";
  return `Search ${sourceNames(aptEnabled, flatpakEnabled)}...`;
}
