import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  FileSearch,
  Icon,
  List,
  Toast,
  confirmAlert,
  environment,
  getPreferenceValues,
  showToast,
} from "@vicinae/api";
import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./hooks/use-debounced-value";
import {
  isOperationCancelled,
  operationErrorMessage,
} from "./errors.ts";
import type { SoftwarePreferences } from "./types";
import {
  LocalPackageError,
  formatFileSize,
  inspectLocalPackage,
  installLocalPackage,
  localPackageActionLabel,
  localPackageIdentifier,
  localPackageSourceLabel,
  type LocalInstallOutcome,
  type LocalPackage,
} from "./local-packages/index.ts";
import { isProcessAborted } from "./utils/process";
import { escapeMarkdown } from "./utils/package-details";
import { LatestRequest } from "./utils/latest-request";

const FILE_SEARCH_LIMIT = 80;
const RESULT_LIMIT = 40;
const SUPPORTED_EXTENSIONS = new Set([".deb", ".flatpak", ".flatpakref", ".appimage"]);

interface LocalPackageFile {
  path: string;
}

export default function InstallLocalPackageCommand() {
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(searchText, 180);
  const [files, setFiles] = useState<LocalPackageFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const latestSearch = useRef(new LatestRequest());

  useEffect(() => {
    const query = debouncedSearchText.trim();

    if (query !== searchText.trim()) {
      latestSearch.current.cancel();
      setFiles([]);
      setSearchError(undefined);
      setIsLoading(searchText.trim().length > 0);
      return;
    }

    if (!query) {
      latestSearch.current.cancel();
      setFiles([]);
      setSearchError(undefined);
      setIsLoading(false);
      return;
    }

    const request = latestSearch.current.start();
    const search = async () => {
      setIsLoading(true);
      setSearchError(undefined);

      const directFile = await resolveDirectPackageFile(query);
      if (!request.isCurrent()) return;

      if (directFile) {
        setFiles([directFile]);
        setIsLoading(false);
        return;
      }

      if (query.length < 2) {
        setFiles([]);
        setIsLoading(false);
        return;
      }

      try {
        const indexedFiles = await FileSearch.search(query, { limit: FILE_SEARCH_LIMIT });
        if (!request.isCurrent()) return;

        const uniqueFiles = new Map<string, LocalPackageFile>();
        for (const file of indexedFiles) {
          if (isSupportedPackagePath(file.path)) {
            uniqueFiles.set(file.path, { path: file.path });
          }
        }
        setFiles([...uniqueFiles.values()].slice(0, RESULT_LIMIT));
      } catch (error) {
        if (!request.isCurrent()) return;
        setFiles([]);
        setSearchError(error instanceof Error ? error.message : "File search is unavailable");
      } finally {
        if (request.isCurrent()) setIsLoading(false);
      }
    };

    void search();
    return () => latestSearch.current.cancel();
  }, [debouncedSearchText, searchText]);

  return (
    <List
      navigationTitle="Depot Install Local"
      searchBarPlaceholder="Search package files or paste an absolute path"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      isLoading={isLoading}
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

async function resolveDirectPackageFile(query: string): Promise<LocalPackageFile | undefined> {
  let filePath: string;
  if (query.startsWith("/")) {
    filePath = query;
  } else if (query.startsWith("~/")) {
    filePath = join(homedir(), query.slice(2));
  } else {
    return undefined;
  }
  if (!isSupportedPackagePath(filePath)) return undefined;

  try {
    const stat = await lstat(filePath);
    if (stat.isFile() && !stat.isSymbolicLink()) return { path: filePath };
  } catch {
    // The in-command search still runs when a pasted path does not exist.
  }
  return undefined;
}

function isSupportedPackagePath(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function packageFormatLabel(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".deb":
      return "DEB";
    case ".flatpak":
      return "Flatpak";
    case ".flatpakref":
      return "Flatpak Ref";
    default:
      return "AppImage";
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
    return "Type a filename or paste an absolute path to a .deb, .flatpak, .flatpakref, or AppImage file.";
  }
  if (query.trim().length < 2) return "Enter at least two characters to search Vicinae's file index.";
  return "Try another filename or paste the package's absolute path.";
}

function LocalPackageReview({ filePath }: { filePath: string }) {
  const { flatpakScope = "user" } = getPreferenceValues<SoftwarePreferences>();
  const [pkg, setPackage] = useState<LocalPackage>();
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<LocalInstallOutcome>();
  const operating = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setPackage(undefined);
    setError(undefined);
    inspectLocalPackage(filePath, {
      flatpakScope,
      signal: controller.signal,
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

  const install = async () => {
    if (!pkg || outcome || operating.current) return;
    const confirmed = await confirmAlert(confirmationFor(pkg));
    if (!confirmed) return;

    operating.current = true;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: pkg.kind === "appimage"
        ? `Integrating ${pkg.name}`
        : `Installing ${pkg.name}`,
      message: operationMessage(pkg),
    });
    try {
      const result = await installLocalPackage(pkg, {
        appImageSupportPath: environment.supportPath,
      });
      setOutcome(result);
      toast.style = Toast.Style.Success;
      toast.title = result.status === "already-installed"
        ? `${pkg.name} is already installed`
        : pkg.kind === "appimage"
        ? `${pkg.name} integrated`
        : `${pkg.name} installed`;
      toast.message = result.managedPath ?? localPackageSourceLabel(pkg);
    } catch (installError) {
      if (isOperationCancelled(installError)) {
        await toast.hide();
        return;
      }
      console.error("Local package installation failed", installError);
      toast.style = Toast.Style.Failure;
      toast.title = operationErrorMessage(
        installError,
        "Local package installation failed",
      );
      toast.message = pkg.fileName;
    } finally {
      operating.current = false;
    }
  };

  const title = pkg?.name ?? "Inspecting Local Package";
  const markdown = error
    ? `## Package could not be inspected\n\n${escapeMarkdown(error)}`
    : pkg
    ? localPackageMarkdown(pkg, outcome)
    : "Inspecting the selected file without installing it…";

  return (
    <Detail
      navigationTitle={title}
      markdown={markdown}
      metadata={pkg ? <LocalPackageMetadata pkg={pkg} outcome={outcome} /> : undefined}
      actions={
        <ActionPanel>
          {pkg && !outcome && (
            <Action
              title={localPackageActionLabel(pkg)}
              icon={pkg.kind === "appimage" ? Icon.AppWindow : Icon.Download}
              onAction={install}
            />
          )}
          <Action.ShowInFinder
            title={outcome?.managedPath
              ? "Show Integrated AppImage"
              : "Show Package File"}
            path={outcome?.managedPath ?? filePath}
            select
          />
          <Action.CopyToClipboard
            title={outcome?.managedPath ? "Copy Managed Path" : "Copy File Path"}
            content={outcome?.managedPath ?? filePath}
          />
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
        </ActionPanel>
      }
    />
  );
}

function LocalPackageMetadata({
  pkg,
  outcome,
}: {
  pkg: LocalPackage;
  outcome?: LocalInstallOutcome;
}) {
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
        </>
      )}
      <Detail.Metadata.Label title="File" text={pkg.fileName} />
      <Detail.Metadata.Label title="File Size" text={formatFileSize(pkg.fileSize)} />
      <Detail.Metadata.Label title="Path" text={pkg.filePath} />
      <Detail.Metadata.Label
        title="Status"
        text={localPackageStatus(pkg, outcome)}
      />
      {outcome?.managedPath && (
        <Detail.Metadata.Label title="Managed Location" text={outcome.managedPath} />
      )}
      {pkg.homepage && (
        <Detail.Metadata.Link title="Homepage" text={pkg.homepage} target={pkg.homepage} />
      )}
    </Detail.Metadata>
  );
}

function localPackageStatus(
  pkg: LocalPackage,
  outcome?: LocalInstallOutcome,
): string {
  if (outcome?.status === "integrated") return "Integrated";
  if (outcome || pkg.installed) return "Installed";
  return "Not installed";
}

function localPackageMarkdown(
  pkg: LocalPackage,
  outcome?: LocalInstallOutcome,
): string {
  const paragraphs = [
    `## ${escapeMarkdown(pkg.name)}`,
    escapeMarkdown(pkg.description),
  ];
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
    if (pkg.icon) paragraphs.push("An embedded PNG icon was found and will be integrated.");
  }
  if (outcome) {
    paragraphs.push(outcome.status === "already-installed"
      ? "✓ This software was already installed."
      : outcome.status === "integrated"
      ? "✓ AppImage integration is complete."
      : "✓ Installation is complete.");
  }
  return paragraphs.join("\n\n");
}

function confirmationFor(pkg: LocalPackage): Alert.Options {
  if (pkg.kind === "appimage") {
    return {
      title: `Integrate ${pkg.name}?`,
      message: [
        "Source: Local file",
        `From: ${pkg.filePath}`,
        `To: ${join(homedir(), "Applications")}`,
        "The AppImage will not be launched automatically.",
      ].join("\n"),
      primaryAction: { title: "Integrate" },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    };
  }
  if (pkg.kind === "flatpakref") {
    return {
      title: `Install ${pkg.name}?`,
      message: [
        `Source: ${localPackageSourceLabel(pkg)}`,
        `Repository: ${pkg.remoteUrl}`,
        "Flatpak may add the remote described by this reference after its normal verification and confirmation checks.",
      ].join("\n"),
      primaryAction: { title: "Install" },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    };
  }
  return {
    title: `Install ${pkg.name}?`,
    message: [
      `Source: ${localPackageSourceLabel(pkg)}`,
      `File: ${pkg.filePath}`,
      pkg.kind === "deb"
        ? "APT will resolve dependencies. Authenticate when prompted."
        : `Flatpak will install this bundle for the ${pkg.scope} scope.`,
    ].join("\n"),
    primaryAction: { title: "Install" },
    dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
  };
}

function operationMessage(pkg: LocalPackage): string {
  if (pkg.kind === "deb") return "APT is resolving dependencies · Authenticate when prompted";
  if (pkg.kind === "appimage") return `Copying to ${join(homedir(), "Applications")}`;
  return `Flatpak · ${pkg.scope === "user" ? "User" : "System"}`;
}
