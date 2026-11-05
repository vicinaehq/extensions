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
import { AptOperationError, aptBackend } from "./backends/apt";
import {
  FlatpakBackend,
  FlatpakOperationError,
} from "./backends/flatpak";
import { ShowSoftwareDetailsAction } from "./components/software-details";
import { useAptSearch } from "./hooks/use-apt-search";
import { useFlatpakSearch } from "./hooks/use-flatpak-search";
import type { SoftwarePackage, SoftwarePreferences } from "./types";
import { installAccessories } from "./utils/software-accessories";
import { rankSoftwareResults } from "./utils/software-results";

export default function InstallCommand() {
  const [searchText, setSearchText] = useState("");
  const installing = useRef(new Set<string>());
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<SoftwarePreferences>();
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
  const results = rankSoftwareResults(
    searchText,
    aptSearch.results,
    flatpakSearch.results,
  );
  const isLoading = aptSearch.isLoading || flatpakSearch.isLoading;
  const normalizedQuery = searchText.trim();

  const install = async (pkg: SoftwarePackage) => {
    const installKey = `${pkg.source}:${pkg.id}`;
    if (installing.current.has(installKey)) return;
    installing.current.add(installKey);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Installing ${pkg.id}`,
      message: pkg.source === "apt"
        ? "Authenticate when prompted"
        : `Flatpak · ${pkg.flatpak?.scope ?? flatpakScope}`,
    });

    try {
      const outcome = pkg.source === "apt"
        ? await aptBackend.install(pkg)
        : await flatpakBackend.install(pkg);
      if (pkg.source === "apt") aptSearch.markInstalled(pkg.id);
      else flatpakSearch.markInstalled(pkg.id);
      toast.style = Toast.Style.Success;
      toast.title = outcome === "already-installed"
        ? `${pkg.id} is already installed`
        : `${pkg.id} installed`;
      toast.message = pkg.source === "apt"
        ? "APT installation completed"
        : "Flatpak installation completed";
    } catch (installError) {
      console.error(`Failed to install ${pkg.id}`, installError);
      toast.style = Toast.Style.Failure;
      toast.title = installError instanceof AptOperationError ||
          installError instanceof FlatpakOperationError
        ? installError.message
        : "Software installation failed";
      toast.message = pkg.id;
    } finally {
      installing.current.delete(installKey);
    }
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={searchPlaceholder(aptEnabled, flatpakEnabled)}
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      {results.map((pkg) => (
        <List.Item
          key={`${pkg.source}:${pkg.id}`}
          id={`${pkg.source}:${pkg.id}`}
          title={pkg.name}
          subtitle={pkg.description}
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
              <ShowSoftwareDetailsAction
                pkg={pkg}
                primaryActions={!pkg.installed
                  ? (
                    <Action
                      title="Install"
                      icon={Icon.Download}
                      onAction={() => install(pkg)}
                    />
                  )
                  : undefined}
              />
              <Action.CopyToClipboard
                title="Copy Package ID"
                content={pkg.id}
              />
            </ActionPanel>
          }
        />
      ))}

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
