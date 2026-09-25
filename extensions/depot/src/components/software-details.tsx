import {
  Action,
  ActionPanel,
  Detail,
  Icon,
} from "@vicinae/api";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AptOperationError, aptBackend } from "../backends/apt";
import type { SoftwarePackage, SoftwareUpdate } from "../types";
import {
  escapeMarkdown,
  packageDescriptionMarkdown,
  packageSourceLabel,
  safeHomepageUrl,
} from "../utils/package-details";
import { isProcessAborted } from "../utils/process";

interface SoftwareDetailsProps {
  pkg: SoftwarePackage | SoftwareUpdate;
  primaryActions?: ReactNode;
}

export function ShowSoftwareDetailsAction({
  pkg,
  primaryActions,
}: SoftwareDetailsProps) {
  return (
    <Action.Push
      title="Show Details"
      icon={Icon.AppWindowSidebarRight}
      target={<SoftwareDetails pkg={pkg} primaryActions={primaryActions} />}
    />
  );
}

function SoftwareDetails({ pkg, primaryActions }: SoftwareDetailsProps) {
  const [details, setDetails] = useState<SoftwarePackage | SoftwareUpdate>(pkg);
  const [isLoading, setIsLoading] = useState(pkg.source === "apt");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (pkg.source !== "apt") {
      setDetails(pkg);
      setIsLoading(false);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(undefined);
    aptBackend.getDetails(pkg.id, controller.signal)
      .then((aptDetails) => {
        if (controller.signal.aborted) return;
        setDetails({
          ...pkg,
          ...aptDetails,
          name: pkg.name,
        });
      })
      .catch((detailsError: unknown) => {
        if (isProcessAborted(detailsError)) return;
        console.error(`Unable to load details for ${pkg.id}`, detailsError);
        setError(detailsError instanceof AptOperationError
          ? detailsError.message
          : "Package details could not be loaded");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [pkg]);

  const homepage = safeHomepageUrl(details.homepage);
  const markdown = isLoading
    ? "Loading package details…"
    : [
      packageDescriptionMarkdown(details),
      error ? `_${escapeMarkdown(error)}_` : undefined,
    ].filter(Boolean).join("\n\n");

  return (
    <Detail
      navigationTitle={details.name}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Source"
            text={packageSourceLabel(details)}
          />
          <Detail.Metadata.Label title="Package ID" text={details.id} />
          {details.version && !isSoftwareUpdate(details) && (
            <Detail.Metadata.Label title="Version" text={details.version} />
          )}
          <Detail.Metadata.Label
            title="Installed"
            text={details.installed ? "Yes" : "No"}
          />
          {isSoftwareUpdate(details) && details.currentVersion && (
            <Detail.Metadata.Label
              title="Current Version"
              text={details.currentVersion}
            />
          )}
          {isSoftwareUpdate(details) && details.availableVersion && (
            <Detail.Metadata.Label
              title="Available Version"
              text={details.availableVersion}
            />
          )}
          {isSoftwareUpdate(details) && details.repository && (
            <Detail.Metadata.Label
              title="Repository"
              text={details.repository}
            />
          )}
          {isSoftwareUpdate(details) && details.architecture && (
            <Detail.Metadata.Label
              title="Architecture"
              text={details.architecture}
            />
          )}
          {details.flatpak?.scope && (
            <Detail.Metadata.Label
              title="Installation"
              text={details.flatpak.scope === "user" ? "User" : "System"}
            />
          )}
          {details.flatpak?.branch && (
            <Detail.Metadata.Label
              title="Branch"
              text={details.flatpak.branch}
            />
          )}
          {isSoftwareUpdate(details) && details.downloadSize && (
            <Detail.Metadata.Label
              title="Download Size"
              text={details.downloadSize}
            />
          )}
          {homepage && (
            <Detail.Metadata.Link
              title="Homepage"
              text={homepage}
              target={homepage}
            />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {primaryActions}
          <Action.CopyToClipboard title="Copy Package ID" content={details.id} />
          {homepage && (
            <Action.OpenInBrowser
              title="Open Homepage"
              icon={Icon.Globe01}
              url={homepage}
            />
          )}
        </ActionPanel>
      }
    />
  );
}

function isSoftwareUpdate(
  pkg: SoftwarePackage | SoftwareUpdate,
): pkg is SoftwareUpdate {
  return "currentVersion" in pkg || "availableVersion" in pkg;
}
