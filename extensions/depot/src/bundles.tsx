import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  List,
  Toast,
  confirmAlert,
  getPreferenceValues,
  showToast,
} from "@vicinae/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { aptBackend } from "./backends/apt.ts";
import { FlatpakBackend } from "./backends/flatpak.ts";
import {
  batchFailureRecord,
  bundleInstallFeedback,
  bundlePackageKey,
  bundleRecentActions,
  installBundlePackages,
  resolveBundle,
  soleBatchFailure,
  type BundleBackends,
} from "./bundle-installation.ts";
import { RecentActionsAction } from "./components/recent-actions.tsx";
import { operationErrorMessage } from "./errors.ts";
import { useSoftwareOperation } from "./hooks/use-software-operation.ts";
import { recentActionSource, recordRecentActions } from "./recent-actions.ts";
import {
  createPackageListBundle,
  type BundlePackage,
  type ResolvedBundlePackage,
  type SoftwareBundle,
} from "./package-bundles.ts";
import type { DepotPreferences } from "./types.ts";
import {
  reportOperationFailure,
  reportOperationResult,
  showOperationBusy,
  updateOperationToast,
} from "./utils/operation-feedback.ts";
import { softwareSourceLabel } from "./utils/software-accessories.ts";
import { isProcessAborted } from "./utils/process.ts";

export interface PackageReviewOnlyItem {
  id: string;
  identifier?: string;
  title: string;
  description: string;
  source: string;
  status: "installed" | "requires-user-action" | "unsupported";
}

export function PackageListForm() {
  const [bundle, setBundle] = useState<SoftwareBundle>();

  if (bundle) return <PackageBatchReview bundle={bundle} />;

  const review = async (values: Form.Values) => {
    try {
      setBundle(createPackageListBundle(
        String(values.apt ?? ""),
        String(values.flatpak ?? ""),
      ));
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: operationErrorMessage(error, "Package list is invalid"),
      });
    }
  };

  return (
    <Form
      navigationTitle="Install Package List"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Review Package List"
            icon={Icon.CheckList}
            onSubmit={review}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="apt"
        title="APT Packages"
        placeholder="git curl build-essential"
        info="Separate package IDs with spaces or commas."
        autoFocus
      />
      <Form.TextField
        id="flatpak"
        title="Flatpak Applications"
        placeholder="org.gimp.GIMP org.inkscape.Inkscape"
        info="Use exact application IDs from configured Flatpak remotes."
      />
      <Form.Description text="Enter one or both lists. Depot will check every package before installation." />
    </Form>
  );
}

export function PackageBatchReview({
  bundle,
  reviewOnlyItems = [],
}: {
  bundle: SoftwareBundle;
  reviewOnlyItems?: readonly PackageReviewOnlyItem[];
}) {
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<DepotPreferences>();
  const backends = useMemo<BundleBackends>(
    () => ({ apt: aptBackend, flatpak: new FlatpakBackend(flatpakScope) }),
    [flatpakScope],
  );
  const [packages, setPackages] = useState<ResolvedBundlePackage[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [generation, setGeneration] = useState(0);
  const installing = useRef(false);
  const operation = useSoftwareOperation();

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(undefined);
    resolveBundle(
      bundle,
      backends,
      { aptEnabled, flatpakEnabled },
      controller.signal,
    )
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setPackages(resolved);
        setSelected(new Set(
          resolved
            .filter((item) => item.status === "available")
            .map((item) => bundlePackageKey(item.entry)),
        ));
      })
      .catch((resolutionError: unknown) => {
        if (isProcessAborted(resolutionError)) return;
        console.error(`Unable to resolve bundle ${bundle.id}`, resolutionError);
        setPackages([]);
        setSelected(new Set());
        setError(operationErrorMessage(
          resolutionError,
          "Package information could not be checked",
        ));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [
    aptEnabled,
    backends,
    flatpakEnabled,
    generation,
    bundle,
  ]);

  const selectedPackages = packages.filter((item) =>
    item.status === "available" &&
    item.pkg &&
    selected.has(bundlePackageKey(item.entry))
  );
  const selectedKeys = new Set(selectedPackages.map((item) =>
    bundlePackageKey(item.entry)
  ));
  const willInstall = packages.filter((item) =>
    item.status === "available" && selectedKeys.has(bundlePackageKey(item.entry))
  );
  const notSelected = packages.filter((item) =>
    item.status === "available" && !selectedKeys.has(bundlePackageKey(item.entry))
  );
  const installed = packages.filter((item) => item.status === "installed");
  const unavailable = packages.filter((item) => item.status === "unavailable");
  const unsupported = packages.filter((item) => item.status === "unsupported");
  const installedReviewItems = reviewOnlyItems.filter(
    (item) => item.status === "installed",
  );
  const requiresUserAction = reviewOnlyItems.filter(
    (item) => item.status === "requires-user-action",
  );
  const unsupportedReviewItems = reviewOnlyItems.filter(
    (item) => item.status === "unsupported",
  );

  const toggle = (entry: BundlePackage) => {
    const key = bundlePackageKey(entry);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const installSelected = async () => {
    if (installing.current) {
      await showOperationBusy();
      return;
    }
    const targets = selectedPackages.flatMap((item) => item.pkg ? [item.pkg] : []);
    if (targets.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No packages selected",
        message: "Select at least one available package",
      });
      return;
    }
    const aptCount = targets.filter((pkg) => pkg.source === "apt").length;
    const flatpakCount = targets.length - aptCount;
    const confirmed = await confirmAlert({
      title: `Install ${targets.length} package${targets.length === 1 ? "" : "s"}?`,
      message: [
        bundle.name,
        aptCount > 0 ? `APT: ${aptCount}` : undefined,
        flatpakCount > 0 ? `Flatpak: ${flatpakCount}` : undefined,
        "Only the selected packages will be installed.",
      ].filter(Boolean).join("\n"),
      primaryAction: { title: "Install Selected" },
      dismissAction: {
        title: "Cancel",
        style: Alert.ActionStyle.Cancel,
      },
    });
    if (!confirmed) return;

    installing.current = true;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Installing ${bundle.name}`,
      message: "Preparing selected packages",
    }).catch((error: unknown) => {
      // The finally below is not reached yet; never leave the flag stuck.
      installing.current = false;
      throw error;
    });
    const operationOptions = operation.start(
      bundle.id,
      (status) => updateOperationToast(toast, status),
    );

    try {
      const result = await installBundlePackages(
        targets,
        backends,
        operationOptions,
      );
      const soleFailure = soleBatchFailure(result);
      const recentActions = bundleRecentActions(bundle.name, result);
      if (soleFailure) {
        await reportOperationFailure(
          toast,
          soleFailure.error,
          "Package installation failed",
          { recent: batchFailureRecord(bundle.name, soleFailure) },
        );
      } else if (result.cancelled && recentActions.length === 0) {
        await toast.hide();
      } else {
        for (const failure of result.failures) {
          console.error(`Bundle installation failed for ${bundle.name}`, failure.error);
        }
        await recordRecentActions(recentActions);
        reportOperationResult(toast, bundleInstallFeedback(bundle.name, result));
      }
      setGeneration((value) => value + 1);
    } catch (installError) {
      await reportOperationFailure(
        toast,
        installError,
        "Package installation failed",
      );
    } finally {
      operation.finish(bundle.id);
      installing.current = false;
    }
  };

  const commonActions = (
    <>
      {selectedPackages.length > 0 && (
        <Action
          title="Install Selected"
          icon={Icon.Download}
          onAction={installSelected}
        />
      )}
      {operation.isCancellable(bundle.id) && (
        <Action
          title="Cancel Installation"
          icon={Icon.XMarkCircle}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "x" }}
          onAction={() => operation.cancel(bundle.id)}
        />
      )}
      {packages.some((item) => item.status === "available") && (
        <>
          <Action
            title="Select All Available"
            icon={Icon.CheckCircle}
            onAction={() => setSelected(new Set(
              packages
                .filter((item) => item.status === "available")
                .map((item) => bundlePackageKey(item.entry)),
            ))}
          />
          <Action
            title="Clear Selection"
            icon={Icon.Circle}
            onAction={() => setSelected(new Set())}
          />
        </>
      )}
      <Action
        title="Refresh Package Status"
        icon={Icon.ArrowClockwise}
        onAction={() => setGeneration((value) => value + 1)}
      />
      <RecentActionsAction />
    </>
  );

  return (
    <List
      navigationTitle={bundle.name}
      isLoading={isLoading}
      searchBarPlaceholder="Review packages..."
      actions={<ActionPanel>{commonActions}</ActionPanel>}
    >
      {willInstall.length > 0 && (
        <List.Section title="Ready">
          <List.Item
            id={`${bundle.id}:install`}
            title={`Install ${willInstall.length} Selected`}
            subtitle="Review complete · press Enter to continue"
            icon={Icon.Download}
            accessories={[{
              text: `${willInstall.length} package${willInstall.length === 1 ? "" : "s"}`,
            }]}
            actions={<ActionPanel>{commonActions}</ActionPanel>}
          />
        </List.Section>
      )}
      {willInstall.length > 0 && (
        <BundlePackageSection
          title="Will Install"
          items={willInstall}
          selected={selected}
          onToggle={toggle}
          commonActions={commonActions}
        />
      )}
      {notSelected.length > 0 && (
        <BundlePackageSection
          title="Available · Not Selected"
          items={notSelected}
          selected={selected}
          onToggle={toggle}
          commonActions={commonActions}
        />
      )}
      {(installed.length > 0 || installedReviewItems.length > 0) && (
        <BundlePackageSection
          title="Already Installed"
          items={installed}
          reviewOnlyItems={installedReviewItems}
          selected={selected}
          onToggle={toggle}
          commonActions={commonActions}
        />
      )}
      {unavailable.length > 0 && (
        <BundlePackageSection
          title="Unavailable"
          items={unavailable}
          selected={selected}
          onToggle={toggle}
          commonActions={commonActions}
        />
      )}
      {requiresUserAction.length > 0 && (
        <BundlePackageSection
          title="Requires User Action"
          items={[]}
          reviewOnlyItems={requiresUserAction}
          selected={selected}
          onToggle={toggle}
          commonActions={commonActions}
        />
      )}
      {(unsupported.length > 0 || unsupportedReviewItems.length > 0) && (
        <BundlePackageSection
          title="Unsupported Backend"
          items={unsupported}
          reviewOnlyItems={unsupportedReviewItems}
          selected={selected}
          onToggle={toggle}
          commonActions={commonActions}
        />
      )}
      {!isLoading && packages.length === 0 && reviewOnlyItems.length === 0 && (
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="Packages could not be reviewed"
          description={error ?? "No package information is available"}
          actions={<ActionPanel>{commonActions}</ActionPanel>}
        />
      )}
    </List>
  );
}

function BundlePackageSection({
  title,
  items,
  reviewOnlyItems = [],
  selected,
  onToggle,
  commonActions,
}: {
  title: string;
  items: readonly ResolvedBundlePackage[];
  reviewOnlyItems?: readonly PackageReviewOnlyItem[];
  selected: ReadonlySet<string>;
  onToggle(entry: BundlePackage): void;
  commonActions: React.ReactNode;
}) {
  return (
    <List.Section
      title={title}
      subtitle={`${items.length + reviewOnlyItems.length}`}
    >
      {items.map((item) => {
        const key = bundlePackageKey(item.entry);
        const isSelected = selected.has(key);
        const source = bundleSourceLabel(item);
        return (
          <List.Item
            key={key}
            id={key}
            title={item.pkg?.name ?? item.entry.id}
            subtitle={item.pkg?.description ?? item.message}
            icon={statusIcon(item, isSelected)}
            keywords={[item.entry.id, source]}
            accessories={[{ text: source }]}
            actions={
              <ActionPanel>
                {item.status === "available" ? (
                  <Action
                    title={isSelected ? "Remove from Selection" : "Add to Selection"}
                    icon={isSelected ? Icon.MinusCircle : Icon.PlusCircle}
                    onAction={() => onToggle(item.entry)}
                  />
                ) : (
                  <Action.CopyToClipboard
                    title="Copy Package ID"
                    content={item.entry.id}
                  />
                )}
                {commonActions}
                {item.status === "available" && (
                  <Action.CopyToClipboard
                    title="Copy Package ID"
                    content={item.entry.id}
                  />
                )}
              </ActionPanel>
            }
          />
        );
      })}
      {reviewOnlyItems.map((item) => (
        <List.Item
          key={item.id}
          id={item.id}
          title={item.title}
          subtitle={item.description}
          icon={reviewOnlyStatusIcon(item.status)}
          keywords={[item.source]}
          accessories={[{ text: item.source }]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Identifier"
                content={item.identifier ?? item.id}
              />
              {commonActions}
            </ActionPanel>
          }
        />
      ))}
    </List.Section>
  );
}

function bundleSourceLabel(item: ResolvedBundlePackage): string {
  return item.pkg
    ? softwareSourceLabel(item.pkg, "remote")
    : recentActionSource(item.entry.source);
}

function statusIcon(item: ResolvedBundlePackage, selected: boolean): Icon {
  if (item.status === "installed") return Icon.CheckCircle;
  if (item.status === "unavailable" || item.status === "unsupported") {
    return Icon.XMarkCircle;
  }
  return selected ? Icon.CircleFilled : Icon.Circle;
}

function reviewOnlyStatusIcon(
  status: PackageReviewOnlyItem["status"],
): Icon {
  if (status === "installed") return Icon.CheckCircle;
  if (status === "requires-user-action") return Icon.Exclamationmark;
  return Icon.XMarkCircle;
}
