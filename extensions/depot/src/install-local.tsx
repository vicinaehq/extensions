import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Form,
  Icon,
  Toast,
  confirmAlert,
  environment,
  getPreferenceValues,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { homedir } from "node:os";
import { join } from "node:path";
import { useEffect, useRef, useState } from "react";
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

interface FilePickerValues extends Form.Values {
  packageFile: string[];
}

export default function InstallLocalPackageCommand() {
  const { push } = useNavigation();
  const [error, setError] = useState<string>();

  const submit = (values: Form.Values) => {
    const paths = (values as FilePickerValues).packageFile;
    const filePath = paths?.[0];
    if (!filePath) {
      setError("Select a package file");
      return;
    }
    push(<LocalPackageReview filePath={filePath} />);
  };

  return (
    <Form
      navigationTitle="Install Local Package"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Inspect Package"
            icon={Icon.MagnifyingGlass}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Supported Formats"
        text="Debian packages (.deb), Flatpak bundles (.flatpak), Flatpak references (.flatpakref), and AppImages. The file type is validated automatically before any installation occurs."
      />
      <Form.FilePicker
        id="packageFile"
        title="Package File"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        canChooseFiles
        error={error}
        onChange={() => setError(undefined)}
      />
    </Form>
  );
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
      })
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
      console.error("Local package installation failed", installError);
      if (
        installError instanceof LocalPackageError &&
        (installError.kind === "cancelled" || installError.kind === "authentication")
      ) {
        await toast.hide();
        return;
      }
      toast.style = Toast.Style.Failure;
      toast.title = installError instanceof LocalPackageError
        ? installError.message
        : "Local package installation failed";
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
        text={outcome
          ? outcome.status === "integrated" ? "Integrated" : "Installed"
          : pkg.installed ? "Installed" : "Not installed"}
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
