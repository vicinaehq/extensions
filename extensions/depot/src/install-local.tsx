import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Icon,
  List,
  Toast,
  confirmAlert,
  environment,
  getPreferenceValues,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { useEffect, useRef, useState } from "react";
import { useIndexedFileSearch } from "./hooks/use-indexed-file-search.ts";
import { useSoftwareOperation } from "./hooks/use-software-operation.ts";
import { RecentActionsAction } from "./components/recent-actions.tsx";
import type { OperationFailure } from "./errors.ts";
import type { DepotPreferences } from "./types.ts";
import { recentActionSource, recordRecentAction } from "./recent-actions.ts";
import {
  LocalPackageError,
  formatFileSize,
  inspectLocalPackage,
  installLocalPackage,
  localPackageActionLabel,
  localPackageActionWords,
  localPackageBlockedReason,
  localPackageIdentifier,
  localPackageSourceLabel,
  type LocalPackage,
} from "./local-packages/index.ts";
import { PACKAGE_EXTENSIONS } from "./local-packages/search.ts";
import {
  reportOperationFailure,
  reportOperationResult,
  updateOperationToast,
} from "./utils/operation-feedback.ts";
import { isProcessAborted } from "./utils/process.ts";
import { escapeMarkdown, fencedTextBlock } from "./utils/package-details.ts";

const PACKAGE_SEARCH = {
  extensions: PACKAGE_EXTENSIONS,
  limitPerExtension: 40,
  resultLimit: 40,
} as const;

export default function InstallLocalPackageCommand() {
  const [searchText, setSearchText] = useState("");
  const {
    files,
    isLoading,
    error: searchError,
  } = useIndexedFileSearch(searchText, PACKAGE_SEARCH);

  return (
    <List
      navigationTitle="Install Local Package"
      searchBarPlaceholder="Search package files or paste an absolute path"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      isLoading={isLoading}
      actions={<ActionPanel><RecentActionsAction /></ActionPanel>}
    >
      {files.map((file) => (
        <List.Item
          key={file.path}
          id={file.path}
          title={basename(file.path)}
          subtitle={dirname(file.path)}
          icon={{ fileIcon: file.path }}
          accessories={[{ tag: packageFormatLabel(file.path) }]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Inspect Package"
                icon={Icon.MagnifyingGlass}
                target={<LocalPackageReview filePath={file.path} />}
              />
              <Action.ShowInFinder title="Show Package File" path={file.path} select />
              <Action.CopyToClipboard title="Copy File Path" content={file.path} />
              <RecentActionsAction />
            </ActionPanel>
          }
        />
      ))}
      {files.length === 0 && (
        <List.EmptyView
          icon={Icon.BlankDocument}
          title={emptyViewTitle(searchText, searchError)}
          description={emptyViewDescription(searchText, searchError)}
        />
      )}
    </List>
  );
}

function packageFormatLabel(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".deb":
      return "DEB";
    case ".flatpak":
      return "Flatpak";
    case ".flatpakref":
      return "Flatpak Ref";
    case ".appimage":
      return "AppImage";
    default:
      return "File";
  }
}

function emptyViewTitle(query: string, error?: string): string {
  if (error) return "Local file search failed";
  if (!query.trim()) return "Search local packages";
  if (query.trim().length < 2) return "Keep typing";
  return "No supported package files found";
}

function emptyViewDescription(query: string, error?: string): string {
  if (error) return error;
  if (!query.trim()) {
    return "Type a filename or paste the absolute path to a .deb, .flatpak, .flatpakref, or AppImage file. Pasted files are recognized by content.";
  }
  if (query.trim().length < 2) return "Enter at least two characters to search Vicinae's file index.";
  return "Try another filename or paste the package's absolute path.";
}

function LocalPackageReview({ filePath }: { filePath: string }) {
  const { pop } = useNavigation();
  const { flatpakScope = "user" } = getPreferenceValues<DepotPreferences>();
  const [pkg, setPackage] = useState<LocalPackage>();
  const [error, setError] = useState<string>();
  const [installFailure, setInstallFailure] = useState<OperationFailure>();
  const operating = useRef(false);
  const operation = useSoftwareOperation();

  useEffect(() => {
    const controller = new AbortController();
    setPackage(undefined);
    setError(undefined);
    setInstallFailure(undefined);
    inspectLocalPackage(filePath, {
      flatpakScope,
      signal: controller.signal,
      appImageLocations: { supportPath: environment.supportPath },
    })
      .then((inspection) => {
        if (!controller.signal.aborted) setPackage(inspection);
      })
      .catch((inspectionError: unknown) => {
        if (isProcessAborted(inspectionError)) return;
        console.error("Local package inspection failed", inspectionError);
        if (!controller.signal.aborted) {
          setError(inspectionError instanceof LocalPackageError
            ? inspectionError.message
            : "The selected package could not be inspected");
        }
      });
    return () => controller.abort();
  }, [filePath, flatpakScope]);

  const blockedReason = pkg ? localPackageBlockedReason(pkg) : undefined;

  const install = async () => {
    if (!pkg || blockedReason || operating.current) return;
    const confirmed = await confirmAlert(confirmationFor(pkg));
    if (!confirmed) return;
    operating.current = true;
    setInstallFailure(undefined);
    const words = localPackageActionWords(pkg);
    const recent = {
      name: pkg.name,
      identifier: localPackageIdentifier(pkg) ?? pkg.fileName,
      source: recentActionSource(pkg.kind),
    };
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `${words.progress} ${pkg.name}`,
      message: operationMessage(pkg),
    }).catch((error: unknown) => {
      // The finally below is not reached yet; never leave the flag stuck.
      operating.current = false;
      throw error;
    });
    const operationOptions = operation.start(
      filePath,
      (status) => updateOperationToast(toast, status),
    );
    try {
      const result = await installLocalPackage(pkg, {
        supportPath: environment.supportPath,
        ...operationOptions,
      });
      const changed = result.status !== "already-installed";
      if (changed) await recordRecentAction({ ...recent, kind: recentKind(pkg) });
      reportOperationResult(toast, {
        status: "success",
        title: changed
          ? `${pkg.name} ${words.done}`
          : `${pkg.name} is already installed`,
        message: result.managedPath ?? localPackageSourceLabel(pkg),
      });
      pop();
    } catch (installError) {
      const failure = await reportOperationFailure(
        toast,
        installError,
        `Could not ${words.title.toLowerCase()} ${pkg.name}`,
        { recent, message: "Review failure details in Depot" },
      );
      if (failure) setInstallFailure(failure);
    } finally {
      operation.finish(filePath);
      operating.current = false;
    }
  };

  const title = pkg?.name ?? "Inspecting Local Package";
  const markdown = error
    ? `## Package could not be inspected\n\n${escapeMarkdown(error)}`
    : pkg
    ? localPackageMarkdown(pkg, installFailure)
    : "Inspecting the selected file without installing it…";

  return (
    <Detail
      navigationTitle={title}
      markdown={markdown}
      metadata={pkg ? <LocalPackageMetadata pkg={pkg} /> : undefined}
      actions={
        <ActionPanel>
          {pkg && !blockedReason && (
            <Action
              title={installFailure
                ? `Retry ${localPackageActionLabel(pkg)}`
                : localPackageActionLabel(pkg)}
              icon={installFailure
                ? Icon.ArrowClockwise
                : pkg.kind === "appimage"
                ? Icon.AppWindow
                : Icon.Download}
              onAction={install}
            />
          )}
          {operation.isCancellable(filePath) && (
            <Action
              title="Cancel Installation"
              icon={Icon.XMarkCircle}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={() => operation.cancel(filePath)}
            />
          )}
          <Action.ShowInFinder
            title="Show Package File"
            path={filePath}
            select
          />
          <Action.CopyToClipboard
            title="Copy File Path"
            content={filePath}
          />
          {pkg && installFailure && (
            <Action.CopyToClipboard
              title="Copy Failure Details"
              content={localPackageFailureText(pkg, installFailure)}
            />
          )}
          {pkg && localPackageIdentifier(pkg) && (
            <Action.CopyToClipboard
              title="Copy Package ID"
              content={localPackageIdentifier(pkg) ?? ""}
            />
          )}
          {pkg?.homepage && (
            <Action.OpenInBrowser
              title="Open Homepage"
              icon={Icon.Globe01}
              url={pkg.homepage}
            />
          )}
          <RecentActionsAction />
        </ActionPanel>
      }
    />
  );
}

function LocalPackageMetadata({ pkg }: { pkg: LocalPackage }) {
  const identifier = localPackageIdentifier(pkg);
  return (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Source" text={localPackageSourceLabel(pkg)} />
      {identifier && (
        <Detail.Metadata.Label
          title={pkg.kind === "deb" ? "Package ID" : "Application ID"}
          text={identifier}
        />
      )}
      {pkg.version && <Detail.Metadata.Label title="Version" text={pkg.version} />}
      {pkg.architecture && (
        <Detail.Metadata.Label title="Architecture" text={pkg.architecture} />
      )}
      {pkg.installedVersion && (
        <Detail.Metadata.Label
          title="Installed Version"
          text={pkg.installedVersion}
        />
      )}
      {"branch" in pkg && pkg.branch && (
        <Detail.Metadata.Label title="Branch" text={pkg.branch} />
      )}
      {pkg.kind === "flatpak-bundle" && pkg.runtime && (
        <Detail.Metadata.Label title="Runtime" text={pkg.runtime} />
      )}
      {pkg.kind === "flatpak-bundle" && pkg.downloadSize && (
        <Detail.Metadata.Label title="Bundle Size" text={pkg.downloadSize} />
      )}
      {pkg.kind === "flatpak-bundle" && pkg.installedSize && (
        <Detail.Metadata.Label title="Installed Size" text={pkg.installedSize} />
      )}
      {pkg.kind === "flatpakref" && (
        <Detail.Metadata.Label title="Repository" text={pkg.remoteUrl} />
      )}
      {pkg.kind === "flatpakref" && pkg.runtimeRepository && (
        <Detail.Metadata.Label
          title="Runtime Repository"
          text={pkg.runtimeRepository}
        />
      )}
      {pkg.kind === "appimage" && (
        <>
          <Detail.Metadata.Label
            title="Validation"
            text="Valid AppImage header and payload"
          />
          <Detail.Metadata.Label
            title="AppImage Type"
            text={`Type ${pkg.appImageType}`}
          />
          {pkg.integratedPath && (
            <Detail.Metadata.Label title="Integrated Copy" text={pkg.integratedPath} />
          )}
        </>
      )}
      <Detail.Metadata.Label title="File" text={pkg.fileName} />
      <Detail.Metadata.Label title="File Size" text={formatFileSize(pkg.fileSize)} />
      <Detail.Metadata.Label title="Path" text={pkg.filePath} />
      <Detail.Metadata.Label title="Status" text={statusText(pkg)} />
      {pkg.homepage && (
        <Detail.Metadata.Link title="Homepage" text={pkg.homepage} target={pkg.homepage} />
      )}
    </Detail.Metadata>
  );
}

function statusText(pkg: LocalPackage): string {
  if (pkg.kind === "appimage") {
    if (!pkg.integratedPath) return "Not integrated";
    return pkg.action === "current"
      ? "Already integrated"
      : "Already integrated · different file";
  }
  switch (pkg.action) {
    case "update":
      return "Installed · Flatpak updates it if this file is newer";
    case "upgrade":
      return "Older version installed";
    case "downgrade":
      return "Newer version installed";
    case "current":
      return pkg.kind === "deb" ? "Same version installed" : "Same build installed";
    default:
      return "Not installed";
  }
}

function recentKind(pkg: LocalPackage): "installed" | "integrated" | "updated" {
  if (pkg.action === "integrate") return "integrated";
  return pkg.action === "update" || pkg.action === "upgrade"
    ? "updated"
    : "installed";
}

function localPackageMarkdown(
  pkg: LocalPackage,
  failure?: OperationFailure,
): string {
  const paragraphs = [
    `## ${escapeMarkdown(pkg.name)}`,
    escapeMarkdown(pkg.description),
  ];
  const blockedReason = localPackageBlockedReason(pkg);
  if (blockedReason) paragraphs.push(`> ${escapeMarkdown(blockedReason)}`);
  if (failure) {
    paragraphs.push(
      `## ${escapeMarkdown(localPackageActionWords(pkg).title)} failed\n\n${escapeMarkdown(failure.message)}`,
      failure.details
        ? `### Package manager details\n\n${fencedTextBlock(failure.details)}`
        : "The package manager did not provide additional technical details.",
    );
  }
  if (pkg.kind === "flatpakref") {
    paragraphs.push(
      "This reference can add its named Flatpak remote as part of the normal Flatpak installation flow. Review the repository URL above before continuing.",
    );
  }
  if (pkg.kind === "appimage") {
    paragraphs.push(
      "AppImages are portable executables from a local file and do not inherit the trust chain of APT repositories or configured Flatpak remotes.",
      `Depot will copy this file to \`${escapeMarkdown(join(homedir(), "Applications"))}\`, make the managed copy executable, and create a user desktop entry. It will not launch the application automatically.`,
    );
    if (pkg.integratedPath && pkg.action !== "current") {
      paragraphs.push(
        `Depot already manages a copy of this application at \`${escapeMarkdown(pkg.integratedPath)}\`. Integrating again creates a separate copy and desktop entry.`,
      );
    }
    if (pkg.icon) paragraphs.push("An embedded PNG icon was found and will be integrated.");
  }
  return paragraphs.join("\n\n");
}

function localPackageFailureText(
  pkg: LocalPackage,
  failure: OperationFailure,
): string {
  return [
    failure.message,
    `Source: ${localPackageSourceLabel(pkg)}`,
    `Package: ${localPackageIdentifier(pkg) ?? pkg.fileName}`,
    `File: ${pkg.filePath}`,
    ...(failure.details ? ["", failure.details] : []),
  ].join("\n");
}

function confirmationFor(pkg: LocalPackage): Alert.Options {
  const { title } = localPackageActionWords(pkg);
  const dismissAction = { title: "Cancel", style: Alert.ActionStyle.Cancel };
  if (pkg.kind === "appimage") {
    return {
      title: pkg.integratedPath
        ? `Integrate Another Copy of ${pkg.name}?`
        : `Integrate ${pkg.name}?`,
      message: [
        "Source: Local file",
        `From: ${pkg.filePath}`,
        `To: ${join(homedir(), "Applications")}`,
        ...(pkg.integratedPath ? [`Existing copy: ${pkg.integratedPath}`] : []),
        "The AppImage will not be launched automatically.",
      ].join("\n"),
      primaryAction: { title: localPackageActionLabel(pkg) },
      dismissAction,
    };
  }
  const versions = pkg.installedVersion
    ? [`Installed: ${pkg.installedVersion}${pkg.version ? ` → ${pkg.version}` : ""}`]
    : [];
  if (pkg.kind === "flatpakref") {
    return {
      title: `${title} ${pkg.name}?`,
      message: [
        `Source: ${localPackageSourceLabel(pkg)}`,
        `Repository: ${pkg.remoteUrl}`,
        ...versions,
        "Flatpak may add the remote described by this reference after its normal verification and confirmation checks.",
      ].join("\n"),
      primaryAction: { title },
      dismissAction,
    };
  }
  return {
    title: `${title} ${pkg.name}?`,
    message: [
      `Source: ${localPackageSourceLabel(pkg)}`,
      `File: ${pkg.filePath}`,
      ...versions,
      pkg.kind === "deb"
        ? "APT will resolve dependencies. Authenticate when prompted."
        : `Flatpak will ${title.toLowerCase()} this bundle for the ${pkg.scope} scope.`,
    ].join("\n"),
    primaryAction: { title },
    dismissAction,
  };
}

function operationMessage(pkg: LocalPackage): string {
  if (pkg.kind === "deb") return "APT is resolving dependencies · Authenticate when prompted";
  if (pkg.kind === "appimage") return `Copying to ${join(homedir(), "Applications")}`;
  return `Flatpak · ${pkg.scope === "user" ? "User" : "System"}`;
}
