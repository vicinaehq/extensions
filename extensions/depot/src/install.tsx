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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { aptBackend } from "./backends/apt.ts";
import { enrichSoftwareItems } from "./backends/appstream-parsing.ts";
import { FlatpakBackend } from "./backends/flatpak.ts";
import { SoftwareDetails } from "./components/software-details.tsx";
import { RecentActionsAction } from "./components/recent-actions.tsx";
import { operationErrorMessage } from "./errors.ts";
import { useAppStreamSearch } from "./hooks/use-appstream-search.ts";
import { useBackendSearch } from "./hooks/use-backend-search.ts";
import { useDebouncedValue } from "./hooks/use-debounced-value.ts";
import { useSoftwareOperation } from "./hooks/use-software-operation.ts";
import ImportProfileCommand from "./import-profile.tsx";
import InstallLocalPackageCommand from "./install-local.tsx";
import {
  PackageBatchReview,
  PackageListForm,
} from "./bundles.tsx";
import { BUILT_IN_BUNDLES } from "./package-bundles.ts";
import type { DepotPreferences, SoftwareItem } from "./types.ts";
import { recentActionSource, recordRecentAction } from "./recent-actions.ts";
import {
  isSearchableQuery,
  type BackendSearch,
} from "./utils/backend-search.ts";
import { OperationLock } from "./utils/operation-lock.ts";
import {
  reportOperationFailure,
  reportOperationResult,
  showOperationBusy,
  updateOperationToast,
} from "./utils/operation-feedback.ts";
import { normalizeSearchText } from "./utils/search-text.ts";
import {
  installAccessories,
  softwareSourceLabel,
} from "./utils/software-accessories.ts";
import {
  findInstalledAlternative,
  rankSoftwareResults,
  softwareItemKey,
} from "./utils/software-results.ts";

const SEARCH_DEBOUNCE_MS = 250;

const QUICK_ACTIONS: ReadonlyArray<{
  id: string;
  title: string;
  subtitle: string;
  icon: Icon;
  actionTitle: string;
  target: ReactElement;
  keywords: string[];
}> = [
  {
    id: "install-local-package",
    title: "Install Local Package",
    subtitle: "DEB, Flatpak, Flatpak Ref, or AppImage",
    icon: Icon.BlankDocument,
    actionTitle: "Choose Local Package",
    target: <InstallLocalPackageCommand />,
    keywords: ["file", "flatpakref", "bundle"],
  },
  {
    id: "install-package-list",
    title: "Install Package List",
    subtitle: "Paste APT and Flatpak package IDs",
    icon: Icon.CheckList,
    actionTitle: "Enter Package List",
    target: <PackageListForm />,
    keywords: ["batch", "multiple", "paste"],
  },
  {
    id: "import-software-profile",
    title: "Import Software Profile",
    subtitle: "Review and restore a saved Depot profile",
    icon: Icon.Download,
    actionTitle: "Choose Software Profile",
    target: <ImportProfileCommand />,
    keywords: ["restore", "backup"],
  },
];

const searchApt: BackendSearch = async (query, signal) => ({
  items: await aptBackend.search(query, signal),
});
const describeAptError = () =>
  "APT search failed. Check that the local APT metadata is available.";
const describeFlatpakError = (error: unknown) =>
  operationErrorMessage(error, "Flatpak search failed");

/** Install state read live by pushed detail views. */
interface InstallActions {
  install(pkg: SoftwareItem): void;
  cancel(pkg: SoftwareItem): void;
  isInstalled(pkg: SoftwareItem): boolean;
  isCancellable(pkg: SoftwareItem): boolean;
}

export default function InstallCommand() {
  const [searchText, setSearchText] = useState("");
  const typedQuery = searchText.trim();
  const query = useDebouncedValue(typedQuery, SEARCH_DEBOUNCE_MS);
  const [installedKeys, setInstalledKeys] = useState<ReadonlySet<string>>(new Set());
  const operationLock = useRef(new OperationLock());
  const operation = useSoftwareOperation();
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
    preferredSource = "all",
  } = getPreferenceValues<DepotPreferences>();
  const flatpakBackend = useMemo(
    () => new FlatpakBackend(flatpakScope),
    [flatpakScope],
  );
  const flatpakActive = useFlatpakPresence(flatpakBackend, flatpakEnabled);
  const searchFlatpak = useCallback<BackendSearch>(
    (value, signal) => flatpakBackend.searchWithStatus(value, signal),
    [flatpakBackend],
  );
  const aptSearch = useBackendSearch(query, searchApt, describeAptError, aptEnabled);
  const flatpakSearch = useBackendSearch(
    query,
    searchFlatpak,
    describeFlatpakError,
    flatpakActive,
  );
  const appStream = useAppStreamSearch(query, aptEnabled || flatpakActive);

  const withSessionInstalls = (items: readonly SoftwareItem[]) =>
    enrichSoftwareItems(items, appStream.components).map((pkg) =>
      installedKeys.has(softwareItemKey(pkg)) ? { ...pkg, installed: true } : pkg
    );
  const aptResults = withSessionInstalls(aptSearch.results);
  const flatpakResults = withSessionInstalls(flatpakSearch.results);
  const candidates = [...aptResults, ...flatpakResults];
  // Hold rows until AppStream settles so late metadata cannot reorder them.
  const results = useSettledValue(
    rankSoftwareResults(query, preferredSource, aptResults, flatpakResults),
    !appStream.isLoading,
  );
  const isLoading = (typedQuery !== query && isSearchableQuery(typedQuery)) ||
    aptSearch.isLoading || flatpakSearch.isLoading || appStream.isLoading;
  const searchNotice = [
    aptSearch.error,
    flatpakSearch.error,
    flatpakSearch.warning,
  ].filter((value): value is string => Boolean(value)).join(" ") || undefined;
  const quickActions = QUICK_ACTIONS.filter((item) =>
    matchesQuery(typedQuery, item.title, item.subtitle, ...item.keywords)
  );
  const bundles = BUILT_IN_BUNDLES.filter((bundle) =>
    matchesQuery(
      typedQuery,
      bundle.name,
      bundle.description,
      ...bundle.packages.map((pkg) => pkg.id),
    )
  );

  const install = async (pkg: SoftwareItem) => {
    const installKey = softwareItemKey(pkg);
    if (!operationLock.current.tryAcquire(installKey)) {
      await showOperationBusy();
      return;
    }

    try {
      const alternative = findInstalledAlternative(pkg, candidates);
      if (alternative && !await confirmAlternativeSourceInstall(pkg, alternative)) {
        return;
      }

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
      const recent = {
        name: pkg.name,
        identifier: pkg.id,
        source: recentActionSource(pkg.source),
      };

      try {
        const outcome = pkg.source === "apt"
          ? await aptBackend.install(pkg, options)
          : await flatpakBackend.install(pkg, options);
        setInstalledKeys((current) => new Set(current).add(installKey));
        if (outcome === "installed") {
          await recordRecentAction({ ...recent, kind: "installed" });
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
        await reportOperationFailure(
          toast,
          installError,
          "Software installation failed",
          { recent, message: pkg.id },
        );
      } finally {
        operation.finish(installKey);
      }
    } finally {
      operationLock.current.release(installKey);
    }
  };

  const actions: InstallActions = {
    install: (pkg) => void install(pkg),
    cancel: (pkg) => operation.cancel(softwareItemKey(pkg)),
    isInstalled: (pkg) => pkg.installed || installedKeys.has(softwareItemKey(pkg)),
    isCancellable: (pkg) => operation.isCancellable(softwareItemKey(pkg)),
  };
  const [liveActions] = useState(() => new LiveValue(actions));
  useEffect(() => liveActions.set(actions));

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={searchPlaceholder(aptEnabled, flatpakActive)}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      actions={<ActionPanel><RecentActionsAction /></ActionPanel>}
    >
      {quickActions.length > 0 && (
        <List.Section title="Install">
          {quickActions.map((item) => (
            <List.Item
              key={item.id}
              id={item.id}
              title={item.title}
              subtitle={item.subtitle}
              icon={item.icon}
              actions={
                <ActionPanel>
                  <Action.Push
                    title={item.actionTitle}
                    icon={item.icon}
                    target={item.target}
                  />
                  <RecentActionsAction />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {bundles.length > 0 && (
        <List.Section title="Built-in Bundles">
          {bundles.map((bundle) => (
            <List.Item
              key={bundle.id}
              id={`bundle:${bundle.id}`}
              title={bundle.name}
              subtitle={bundle.description || undefined}
              icon={Icon.CheckList}
              accessories={[
                { tag: "Bundle" },
                {
                  text: `${bundle.packages.length} package${
                    bundle.packages.length === 1 ? "" : "s"
                  }`,
                },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Review Bundle"
                    icon={Icon.CheckList}
                    target={<PackageBatchReview bundle={bundle} />}
                  />
                  <RecentActionsAction />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

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
              accessories={installAccessories(pkg)}
              actions={
                <ActionPanel>
                  <InstallActionItems pkg={pkg} actions={actions} />
                  <Action.Push
                    title="Show Details"
                    icon={Icon.AppWindowSidebarRight}
                    target={<LiveSoftwareDetails pkg={pkg} live={liveActions} />}
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

      {typedQuery && (
        <SearchEmptyView
          query={typedQuery}
          isLoading={isLoading}
          aptError={aptSearch.error}
          flatpakError={flatpakSearch.error}
          flatpakWarning={flatpakSearch.warning}
          resultCount={results.length}
          aptEnabled={aptEnabled}
          flatpakEnabled={flatpakEnabled}
          flatpakActive={flatpakActive}
        />
      )}
    </List>
  );
}

/** Flatpak is optional; when absent it is dropped silently from search. */
function useFlatpakPresence(backend: FlatpakBackend, enabled: boolean): boolean {
  const [present, setPresent] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void backend.isAvailable().then((available) => {
      if (active) setPresent(available);
    });
    return () => {
      active = false;
    };
  }, [backend, enabled]);
  return enabled && present;
}

/** Returns the latest value seen while `settled` was true. */
function useSettledValue<T>(value: T, settled: boolean): T {
  const settledValue = useRef(value);
  if (settled) settledValue.current = value;
  return settledValue.current;
}

class LiveValue<T> {
  private value: T;
  private readonly listeners = new Set<() => void>();

  constructor(value: T) {
    this.value = value;
  }

  get = (): T => this.value;

  set(value: T): void {
    this.value = value;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

function LiveSoftwareDetails({
  pkg,
  live,
}: {
  pkg: SoftwareItem;
  live: LiveValue<InstallActions>;
}) {
  const actions = useSyncExternalStore(live.subscribe, live.get);
  return (
    <SoftwareDetails
      pkg={pkg}
      installed={actions.isInstalled(pkg)}
      primaryActions={<InstallActionItems pkg={pkg} actions={actions} />}
    />
  );
}

function InstallActionItems({
  pkg,
  actions,
}: {
  pkg: SoftwareItem;
  actions: InstallActions;
}) {
  return (
    <>
      {!actions.isInstalled(pkg) && (
        <Action
          title="Install"
          icon={Icon.Download}
          onAction={() => actions.install(pkg)}
        />
      )}
      {actions.isCancellable(pkg) && (
        <Action
          title="Cancel Installation"
          icon={Icon.XMarkCircle}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "x" }}
          onAction={() => actions.cancel(pkg)}
        />
      )}
    </>
  );
}

function matchesQuery(query: string, ...texts: string[]): boolean {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalizeSearchText(texts.join(" "));
  return tokens.every((token) => haystack.includes(token));
}

function confirmAlternativeSourceInstall(
  pkg: SoftwareItem,
  installedAlternative: SoftwareItem,
): Promise<boolean> {
  return confirmAlert({
    title: `${installedAlternative.name} is already installed`,
    message: [
      `Existing: ${softwareSourceLabel(installedAlternative, "scope")} · ${installedAlternative.id}`,
      `Selected: ${softwareSourceLabel(pkg, "scope")} · ${pkg.id}`,
      "Installing from another source may result in two copies of this application.",
    ].join("\n"),
    primaryAction: {
      title: "Install Anyway",
    },
    dismissAction: {
      title: "Cancel",
      style: Alert.ActionStyle.Cancel,
    },
  });
}

function OpenPreferencesPanel() {
  return (
    <ActionPanel>
      <Action
        title="Open Extension Preferences"
        icon={Icon.Cog}
        onAction={() => openExtensionPreferences()}
      />
    </ActionPanel>
  );
}

function SearchEmptyView({
  query,
  isLoading,
  aptError,
  flatpakError,
  flatpakWarning,
  resultCount,
  aptEnabled,
  flatpakEnabled,
  flatpakActive,
}: {
  query: string;
  isLoading: boolean;
  aptError?: string;
  flatpakError?: string;
  flatpakWarning?: string;
  resultCount: number;
  aptEnabled: boolean;
  flatpakEnabled: boolean;
  flatpakActive: boolean;
}) {
  if (resultCount > 0) return null;

  if (!aptEnabled && !flatpakActive) {
    return (
      <List.EmptyView
        icon={Icon.Cog}
        title={flatpakEnabled
          ? "No package sources available"
          : "No package sources enabled"}
        description={flatpakEnabled
          ? "Flatpak is not installed or has no remotes. Enable APT in the extension preferences."
          : "Enable APT or Flatpak in the extension preferences"}
        actions={<OpenPreferencesPanel />}
      />
    );
  }

  const errors = [aptError, flatpakError].filter(
    (value): value is string => Boolean(value),
  );
  const activeSourceCount = Number(aptEnabled) + Number(flatpakActive);
  if (errors.length === activeSourceCount) {
    return (
      <List.EmptyView
        icon={Icon.XMarkCircle}
        title="Software search unavailable"
        description={errors.join(" ")}
        actions={<OpenPreferencesPanel />}
      />
    );
  }

  if (!isSearchableQuery(query)) {
    return (
      <List.EmptyView
        icon={Icon.MagnifyingGlass}
        title={`Start typing to search ${sourceNames(aptEnabled, flatpakActive)}`}
        description="Enter at least 2 characters"
      />
    );
  }

  if (isLoading) return null;

  return (
    <List.EmptyView
      icon={Icon.MagnifyingGlass}
      title="No software found"
      description={[...errors, flatpakWarning].filter(Boolean).join(" ") ||
        "Try a different application name or description"}
    />
  );
}

function sourceNames(aptEnabled: boolean, flatpakActive: boolean): string {
  if (aptEnabled && flatpakActive) return "APT and Flatpak";
  return aptEnabled ? "APT" : "Flatpak";
}

function searchPlaceholder(aptEnabled: boolean, flatpakActive: boolean): string {
  if (!aptEnabled && !flatpakActive) return "Enable a package source...";
  return `Search ${sourceNames(aptEnabled, flatpakActive)}...`;
}
