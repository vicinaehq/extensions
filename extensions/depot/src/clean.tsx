import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  List,
  Toast,
  confirmAlert,
  getPreferenceValues,
  showToast,
} from "@vicinae/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { aptBackend, type AptCleanupPreview } from "./backends/apt.ts";
import type { FlatpakCleanupItem } from "./backends/cleanup-parsing.ts";
import { FlatpakBackend } from "./backends/flatpak.ts";
import { RecentActionsAction } from "./components/recent-actions.tsx";
import { recordRecentAction } from "./recent-actions.ts";
import {
  describeOperationError,
  isOperationCancelled,
  type OperationFailure,
} from "./errors.ts";
import type { DepotPreferences, FlatpakScope } from "./types.ts";
import { summarizeCleanupTargets } from "./utils/cleanup.ts";
import {
  type FailedActionRecord,
  reportOperationFailure,
  reportOperationResult,
  showOperationBusy,
  updateOperationToast,
} from "./utils/operation-feedback.ts";
import { isProcessAborted } from "./utils/process.ts";
import { sourceWarning, updateSourceErrors } from "./utils/update-errors.ts";

export default function CleanCommand() {
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<DepotPreferences>();
  const flatpakBackend = useMemo(
    () => new FlatpakBackend(flatpakScope),
    [flatpakScope],
  );
  const [aptPreview, setAptPreview] = useState<AptCleanupPreview>();
  const [flatpakItems, setFlatpakItems] = useState<FlatpakCleanupItem[]>([]);
  const [aptError, setAptError] = useState<OperationFailure>();
  const [flatpakError, setFlatpakError] = useState<OperationFailure>();
  const [isLoading, setIsLoading] = useState(true);
  const [generation, setGeneration] = useState(0);
  const cleaning = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setAptPreview(undefined);
    setFlatpakItems([]);
    setAptError(undefined);
    setFlatpakError(undefined);

    Promise.allSettled([
      aptEnabled
        ? aptBackend.previewCleanup(controller.signal)
        : Promise.resolve(undefined),
      flatpakEnabled
        ? flatpakBackend.previewCleanup(controller.signal)
        : Promise.resolve([]),
    ]).then(([aptResult, flatpakResult]) => {
      if (controller.signal.aborted) return;

      if (aptResult.status === "fulfilled") {
        setAptPreview(aptResult.value);
      } else if (!isProcessAborted(aptResult.reason)) {
        console.error("APT cleanup preview failed", aptResult.reason);
        setAptPreview(undefined);
        setAptError(describeOperationError(
          aptResult.reason,
          "APT cleanup could not be inspected",
        ));
      }

      if (flatpakResult.status === "fulfilled") {
        setFlatpakItems(flatpakResult.value);
      } else if (!isProcessAborted(flatpakResult.reason)) {
        console.error("Flatpak cleanup preview failed", flatpakResult.reason);
        setFlatpakItems([]);
        setFlatpakError(describeOperationError(
          flatpakResult.reason,
          "Flatpak cleanup could not be inspected",
        ));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });

    return () => controller.abort();
  }, [aptEnabled, flatpakBackend, flatpakEnabled, generation]);

  const aptPackageCount = aptPreview?.packageIds.length ?? 0;
  const aptArchiveCount = aptPreview?.archives.length ?? 0;
  const { cleanableCount, hasAptCleanup } = summarizeCleanupTargets(
    aptPackageCount,
    aptArchiveCount,
    flatpakItems.length,
  );
  const hasPreviewError = Boolean(aptError || flatpakError);

  const clean = async () => {
    if (cleanableCount === 0) return;
    if (cleaning.current) {
      await showOperationBusy();
      return;
    }
    cleaning.current = true;
    let started = false;

    try {
      const confirmed = await confirmAlert({
        title: "Clean up system?",
        message: cleanupConfirmation(
          aptPackageCount,
          aptArchiveCount,
          flatpakItems.length,
        ),
        primaryAction: { title: "Clean Up" },
        dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
      });
      if (!confirmed) return;
      started = true;

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Cleaning up system",
        message: hasAptCleanup ? "Authenticate for APT when prompted" : "Preparing Flatpak",
      });
      // Cleanup is not cancellable: APT runs through pkexec and Flatpak
      // removes the reviewed runtimes in one command.
      const options = {
        onStatus: (status: Parameters<typeof updateOperationToast>[1]) =>
          updateOperationToast(toast, status),
      };
      let aptFailure: OperationFailure | undefined;
      let flatpakFailure: OperationFailure | undefined;

      if (hasAptCleanup && aptPreview) {
        try {
          await aptBackend.clean(aptPreview, options);
        } catch (error) {
          if (!flatpakItems.length) {
            await reportOperationFailure(toast, error, "APT cleanup failed", {
              recent: cleanupRecord("APT", aptPreview.packageIds),
            });
            return;
          }
          if (isOperationCancelled(error)) {
            await toast.hide();
            return;
          }
          console.error("APT cleanup failed", error);
          aptFailure = describeOperationError(error, "APT cleanup failed");
          await recordCleanupFailure("APT", aptPreview.packageIds, aptFailure);
        }
      }

      if (flatpakItems.length > 0) {
        try {
          await flatpakBackend.cleanUnused(flatpakItems, options);
        } catch (error) {
          if (isOperationCancelled(error)) {
            await toast.hide();
            return;
          }
          console.error("Flatpak cleanup failed", error);
          flatpakFailure = describeOperationError(error, "Flatpak cleanup failed");
          await recordCleanupFailure(
            "Flatpak",
            flatpakItems.map((item) => item.id),
            flatpakFailure,
          );
        }
      }

      if (!aptFailure && !flatpakFailure) {
        reportOperationResult(toast, {
          status: "success",
          title: "System cleanup complete",
          message: "Checking for anything still unused",
        });
      } else {
        reportOperationResult(toast, {
          status: "failure",
          title: aptFailure && flatpakFailure
            ? "System cleanup failed"
            : (aptFailure ?? flatpakFailure)!.message,
          message: [
            ...updateSourceErrors(aptFailure, flatpakFailure),
            "Details in Recent Actions",
          ].join(" · "),
        });
      }
    } finally {
      cleaning.current = false;
      if (started) setGeneration((value) => value + 1);
    }
  };

  const commonActions = (
    <>
      {cleanableCount > 0 && (
        <Action
          title="Clean Up System"
          icon={Icon.Trash}
          onAction={clean}
        />
      )}
      <Action
        title="Refresh Cleanup Preview"
        icon={Icon.ArrowClockwise}
        onAction={() => setGeneration((value) => value + 1)}
      />
      <RecentActionsAction />
    </>
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Review cleanup items..."
      actions={<ActionPanel>{commonActions}</ActionPanel>}
    >
      {!isLoading && (
        <List.Section title="System Cleanup">
          <List.Item
            id="cleanup-status"
            title={cleanableCount > 0
              ? "Clean Up System"
              : hasPreviewError
              ? "Cleanup Preview Incomplete"
              : "Nothing to Clean"}
            subtitle={cleanableCount > 0
              ? `${cleanableCount} item${cleanableCount === 1 ? "" : "s"} across enabled sources`
              : hasPreviewError
              ? "Review the source warnings below"
              : "APT and Flatpak have no known unused items"}
            icon={cleanableCount > 0
              ? Icon.Trash
              : hasPreviewError
              ? Icon.Exclamationmark
              : Icon.CheckCircle}
            actions={<ActionPanel>{commonActions}</ActionPanel>}
          />
        </List.Section>
      )}

      {aptPreview && aptPreview.packageIds.length > 0 && (
        <List.Section
          title="APT · Unused Packages"
          subtitle={aptPreview.reclaimableSpace
            ? `${aptPreview.reclaimableSpace} reclaimable`
            : `${aptPreview.packageIds.length}`}
        >
          {aptPreview.packageIds.map((id) => (
            <List.Item
              key={`apt:${id}`}
              id={`apt:${id}`}
              title={id}
              subtitle="Unused dependency · configuration will be purged"
              icon={Icon.Trash}
              accessories={[{ tag: "APT" }]}
              actions={<ActionPanel>{commonActions}</ActionPanel>}
            />
          ))}
        </List.Section>
      )}

      {aptPreview &&
        (aptPreview.archives.length > 0 || aptPreview.cacheInspectionLimited) && (
        <List.Section title="APT · Obsolete Package Archives">
          {aptPreview.archives.map((archive) => (
            <List.Item
              key={`archive:${archive.packageId}:${archive.version}`}
              id={`archive:${archive.packageId}:${archive.version}`}
              title={archive.packageId}
              subtitle={`Cached version ${archive.version}`}
              icon={Icon.BlankDocument}
              accessories={[
                ...(archive.size ? [{ text: archive.size }] : []),
                { tag: "APT Cache" },
              ]}
              actions={<ActionPanel>{commonActions}</ActionPanel>}
            />
          ))}
          {aptPreview.cacheInspectionLimited && (
            <List.Item
              id="apt-partial-cache"
              title="Partial Downloads Not Inspected"
              subtitle="APT's partial-download folder needs administrator access to read; it is not cleaned"
              icon={Icon.Info01}
              accessories={[{ tag: "Information" }]}
              actions={<ActionPanel>{commonActions}</ActionPanel>}
            />
          )}
        </List.Section>
      )}

      {(["user", "system"] as const).map((scope) => (
        <FlatpakCleanupSection
          key={scope}
          scope={scope}
          items={flatpakItems.filter((item) => item.scope === scope)}
          actions={commonActions}
        />
      ))}

      {(aptError || flatpakError) && (
        <List.Section title="Source Warnings">
          {aptError && (
            <List.Item
              id="apt-cleanup-error"
              title="APT cleanup is unavailable"
              subtitle={sourceWarning("APT", aptError)}
              icon={Icon.Exclamationmark}
              actions={<ActionPanel>{commonActions}</ActionPanel>}
            />
          )}
          {flatpakError && (
            <List.Item
              id="flatpak-cleanup-error"
              title="Flatpak cleanup is unavailable"
              subtitle={sourceWarning("Flatpak", flatpakError)}
              icon={Icon.Exclamationmark}
              actions={<ActionPanel>{commonActions}</ActionPanel>}
            />
          )}
        </List.Section>
      )}

      <List.Section title="AppImage">
        <List.Item
          id="appimage-cleanup-policy"
          title="AppImages Remain Unchanged"
          subtitle="Portable applications have no dependency cache to clean safely"
          icon={Icon.AppWindow}
          accessories={[{ tag: "No automatic cleanup" }]}
          actions={<ActionPanel>{commonActions}</ActionPanel>}
        />
      </List.Section>
    </List>
  );
}

function FlatpakCleanupSection({
  scope,
  items,
  actions,
}: {
  scope: FlatpakScope;
  items: readonly FlatpakCleanupItem[];
  actions: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <List.Section title={`Flatpak · ${scope === "user" ? "User" : "System"}`}>
      {items.map((item) => (
        <List.Item
          key={`flatpak:${scope}:${item.id}:${item.branch ?? "unknown"}`}
          id={`flatpak:${scope}:${item.id}:${item.branch ?? "unknown"}`}
          title={item.id}
          subtitle={[
            "Unused Flatpak runtime",
            item.branch,
            `${scope} installation`,
          ].filter(Boolean).join(" · ")}
          icon={Icon.Trash}
          accessories={[{ tag: "Flatpak" }]}
          actions={<ActionPanel>{actions}</ActionPanel>}
        />
      ))}
    </List.Section>
  );
}

function cleanupConfirmation(
  aptPackages: number,
  aptArchives: number,
  flatpakRuntimes: number,
): string {
  return [
    aptPackages > 0
      ? `APT: purge ${aptPackages} unused package${aptPackages === 1 ? "" : "s"}`
      : undefined,
    aptArchives > 0
      ? `APT: remove ${aptArchives} obsolete cached archive${aptArchives === 1 ? "" : "s"}`
      : undefined,
    flatpakRuntimes > 0
      ? `Flatpak: remove ${flatpakRuntimes} unused runtime${flatpakRuntimes === 1 ? "" : "s"}`
      : undefined,
    "AppImages and application data will not be changed.",
  ].filter(Boolean).join("\n");
}

/** The Recent Actions identity of a cleanup; archives-only cleanups have no IDs. */
function cleanupRecord(
  source: "APT" | "Flatpak",
  identifiers: readonly string[],
): FailedActionRecord {
  return {
    name: `${source} cleanup`,
    identifier: identifiers.length > 0
      ? identifiers.join(", ")
      : "obsolete package archives",
    source,
  };
}

function recordCleanupFailure(
  source: "APT" | "Flatpak",
  identifiers: readonly string[],
  failure: OperationFailure,
): Promise<void> {
  return recordRecentAction({
    ...cleanupRecord(source, identifiers),
    kind: "failed",
    summary: failure.message,
    details: failure.details,
  });
}
