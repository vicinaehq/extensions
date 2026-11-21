import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  environment,
  getPreferenceValues,
  showToast,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import {
  listInstalledAppImages,
  type InstalledAppImage,
} from "./appimages.ts";
import { aptBackend } from "./backends/apt.ts";
import { FlatpakBackend } from "./backends/flatpak.ts";
import { operationErrorMessage } from "./errors.ts";
import {
  createSoftwareProfile,
  defaultProfileDirectory,
  profileAppImage,
  writeSoftwareProfile,
} from "./software-profiles.ts";
import type { DepotPreferences, SoftwareItem } from "./types.ts";
import { reportOperationFailure } from "./utils/operation-feedback.ts";
import { isProcessAborted } from "./utils/process.ts";

type ExportItem =
  | { key: string; source: "APT"; id: string; title: string; subtitle: string }
  | { key: string; source: "Flatpak"; id: string; title: string; subtitle: string }
  | {
    key: string;
    source: "AppImage";
    id: string;
    title: string;
    subtitle: string;
    appImage: InstalledAppImage;
  };

export default function ExportProfileCommand() {
  const {
    aptEnabled = true,
    flatpakEnabled = true,
    flatpakScope = "user",
  } = getPreferenceValues<DepotPreferences>();
  const flatpakBackend = useMemo(
    () => new FlatpakBackend(flatpakScope),
    [flatpakScope],
  );
  const [aptIds, setAptIds] = useState<string[]>([]);
  const [flatpaks, setFlatpaks] = useState<SoftwareItem[]>([]);
  const [appImages, setAppImages] = useState<InstalledAppImage[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savedPath, setSavedPath] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrors([]);
    Promise.allSettled([
      aptEnabled
        ? aptBackend.listManualPackageIds(controller.signal)
        : Promise.resolve([]),
      flatpakEnabled
        ? flatpakBackend.listInstalled(controller.signal)
        : Promise.resolve([]),
      listInstalledAppImages(
        { supportPath: environment.supportPath },
        controller.signal,
      ),
    ]).then(([aptResult, flatpakResult, appImageResult]) => {
      if (controller.signal.aborted) return;
      const loadedApt = aptResult.status === "fulfilled" ? aptResult.value : [];
      const loadedFlatpaks = flatpakResult.status === "fulfilled"
        ? uniqueSoftwareItems(flatpakResult.value)
        : [];
      const loadedAppImages = appImageResult.status === "fulfilled"
        ? appImageResult.value
        : [];
      setAptIds(loadedApt);
      setFlatpaks(loadedFlatpaks);
      setAppImages(loadedAppImages);
      setSelected(new Set([
        ...loadedApt.map((id) => `apt:${id}`),
        ...loadedFlatpaks.map((pkg) => `flatpak:${pkg.id}`),
        ...loadedAppImages.map((appImage) => `appimage:${appImage.fileName}`),
      ]));
      setErrors([
        aptResult.status === "rejected"
          ? operationErrorMessage(aptResult.reason, "APT packages could not be loaded")
          : undefined,
        flatpakResult.status === "rejected"
          ? operationErrorMessage(flatpakResult.reason, "Flatpak applications could not be loaded")
          : undefined,
        appImageResult.status === "rejected"
          ? operationErrorMessage(appImageResult.reason, "AppImages could not be loaded")
          : undefined,
      ].filter((message): message is string => Boolean(message)));
    }).catch((error: unknown) => {
      if (isProcessAborted(error)) return;
      setErrors([operationErrorMessage(error, "Installed software could not be loaded")]);
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [aptEnabled, flatpakBackend, flatpakEnabled]);

  const aptItems: ExportItem[] = aptIds.map((id) => ({
    key: `apt:${id}`,
    source: "APT",
    id,
    title: id,
    subtitle: "Manually marked APT package",
  }));
  const flatpakItems: ExportItem[] = flatpaks.map((pkg) => ({
    key: `flatpak:${pkg.id}`,
    source: "Flatpak",
    id: pkg.id,
    title: pkg.name,
    subtitle: pkg.id,
  }));
  const appImageItems: ExportItem[] = appImages.map((appImage) => ({
    key: `appimage:${appImage.fileName}`,
    source: "AppImage",
    id: appImage.fileName,
    title: appImage.name,
    subtitle: "Manual restoration required on another machine",
    appImage,
  }));
  const items = [...aptItems, ...flatpakItems, ...appImageItems];
  const selectedItems = items.filter((item) => selected.has(item.key));

  const setAptSelected = (include: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of aptItems) {
        if (include) next.add(item.key);
        else next.delete(item.key);
      }
      return next;
    });
  };

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportSelected = async () => {
    if (selectedItems.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No software selected",
      });
      return;
    }
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Exporting software profile",
    });
    try {
      const profile = createSoftwareProfile({
        apt: selectedItems.flatMap((item) =>
          item.source === "APT" ? [item.id] : []
        ),
        flatpak: selectedItems.flatMap((item) =>
          item.source === "Flatpak" ? [item.id] : []
        ),
        appImages: selectedItems.flatMap((item) =>
          item.source === "AppImage" ? [profileAppImage(item.appImage)] : []
        ),
      });
      const path = await writeSoftwareProfile(
        profile,
        await defaultProfileDirectory(),
      );
      setSavedPath(path);
      toast.style = Toast.Style.Success;
      toast.title = "Software profile exported";
      toast.message = path;
      await toast.update();
    } catch (error) {
      await reportOperationFailure(
        toast,
        error,
        "Software profile could not be exported",
      );
    }
  };

  if (savedPath) {
    return (
      <List navigationTitle="Export Software Profile">
        <List.Item
          title="Software Profile Exported"
          subtitle={savedPath}
          icon={Icon.CheckCircle}
          actions={
            <ActionPanel>
              <Action.ShowInFinder title="Show Profile File" path={savedPath} select />
              <Action.CopyToClipboard title="Copy Profile Path" content={savedPath} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const commonActions = (
    <>
      <Action
        title="Export Selected"
        icon={Icon.SaveDocument}
        onAction={exportSelected}
      />
      <Action
        title="Select All"
        icon={Icon.CheckCircle}
        onAction={() => setSelected(new Set(items.map((item) => item.key)))}
      />
      <Action
        title="Clear Selection"
        icon={Icon.Circle}
        onAction={() => setSelected(new Set())}
      />
      {aptItems.length > 0 && (
        <>
          <Action
            title="Select All APT Packages"
            icon={Icon.CheckCircle}
            onAction={() => setAptSelected(true)}
          />
          <Action
            title="Deselect All APT Packages"
            icon={Icon.Circle}
            onAction={() => setAptSelected(false)}
          />
        </>
      )}
    </>
  );

  return (
    <List
      navigationTitle="Export Software Profile"
      isLoading={isLoading}
      searchBarPlaceholder="Review software to export..."
    >
      {!isLoading && items.length > 0 && (
        <List.Section title="Ready">
          {selectedItems.length > 0 && (
            <List.Item
              id="export-selected"
              title={`Export ${selectedItems.length} Selected`}
              subtitle="Profiles contain package identifiers only"
              icon={Icon.SaveDocument}
              actions={<ActionPanel>{commonActions}</ActionPanel>}
            />
          )}
          <List.Item
            id="export-scope"
            title="Only manually installed software is listed"
            subtitle="Dependencies are excluded · review APT entries, which may include system tools"
            icon={Icon.Info01}
            actions={<ActionPanel>{commonActions}</ActionPanel>}
          />
        </List.Section>
      )}
      {errors.length > 0 && (
        <List.Section title="Source Warnings">
          {errors.map((message, index) => (
            <List.Item
              key={`${index}:${message}`}
              id={`warning:${index}`}
              title="Some installed software could not be loaded"
              subtitle={message}
              icon={Icon.Exclamationmark}
            />
          ))}
        </List.Section>
      )}
      <ExportSection
        title="APT · Review Manual Marks"
        subtitle="Ubuntu's installer may mark packages as manual"
        items={aptItems}
        selected={selected}
        onToggle={toggle}
        commonActions={commonActions}
      />
      <ExportSection
        title="Flatpak Applications"
        items={flatpakItems}
        selected={selected}
        onToggle={toggle}
        commonActions={commonActions}
      />
      <ExportSection
        title="AppImages · Manual Restore"
        items={appImageItems}
        selected={selected}
        onToggle={toggle}
        commonActions={commonActions}
      />
      {!isLoading && items.length === 0 && (
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="No software available to export"
          description={errors.join(" ") || "No supported installed software was found."}
        />
      )}
    </List>
  );
}

function ExportSection({
  title,
  subtitle,
  items,
  selected,
  onToggle,
  commonActions,
}: {
  title: string;
  subtitle?: string;
  items: readonly ExportItem[];
  selected: ReadonlySet<string>;
  onToggle(key: string): void;
  commonActions: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <List.Section title={title} subtitle={subtitle}>
      {items.map((item) => {
        const isSelected = selected.has(item.key);
        return (
          <List.Item
            key={item.key}
            id={item.key}
            title={item.title}
            subtitle={item.subtitle}
            icon={isSelected ? Icon.CircleFilled : Icon.Circle}
            accessories={[{ text: item.source }]}
            actions={
              <ActionPanel>
                <Action
                  title={isSelected ? "Remove from Profile" : "Add to Profile"}
                  icon={isSelected ? Icon.MinusCircle : Icon.PlusCircle}
                  onAction={() => onToggle(item.key)}
                />
                {commonActions}
              </ActionPanel>
            }
          />
        );
      })}
    </List.Section>
  );
}


function uniqueSoftwareItems(items: readonly SoftwareItem[]): SoftwareItem[] {
  const unique = new Map<string, SoftwareItem>();
  for (const item of items) {
    if (!unique.has(item.id)) unique.set(item.id, item);
  }
  return [...unique.values()];
}
