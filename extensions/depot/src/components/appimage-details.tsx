import {
  Action,
  ActionPanel,
  Detail,
  Icon,
} from "@vicinae/api";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  loadInstalledAppImageDetails,
  type AppImageLocations,
  type InstalledAppImage,
} from "../appimages.ts";
import { operationErrorMessage } from "../errors.ts";
import type { AppImageMetadata } from "../local-packages/appimage.ts";
import { formatFileSize } from "../local-packages/index.ts";
import { escapeMarkdown, safeHomepageUrl } from "../utils/package-details.ts";
import { isProcessAborted } from "../utils/process.ts";

interface AppImageDetailsProps {
  appImage: InstalledAppImage;
  locations: AppImageLocations;
  primaryActions?: ReactNode;
}

export function ShowAppImageDetailsAction(props: AppImageDetailsProps) {
  return (
    <Action.Push
      title="Show Details"
      icon={Icon.AppWindowSidebarRight}
      target={<AppImageDetails {...props} />}
    />
  );
}

function AppImageDetails({
  appImage,
  locations,
  primaryActions,
}: AppImageDetailsProps) {
  const [details, setDetails] = useState<AppImageMetadata>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    setDetails(undefined);
    setError(undefined);
    loadInstalledAppImageDetails(appImage, locations, controller.signal)
      .then((metadata) => {
        if (!controller.signal.aborted) setDetails(metadata);
      })
      .catch((detailsError: unknown) => {
        if (isProcessAborted(detailsError)) return;
        console.error(`Unable to inspect AppImage ${appImage.filePath}`, detailsError);
        setError(operationErrorMessage(
          detailsError,
          "AppImage details could not be loaded",
        ));
      });
    return () => controller.abort();
  }, [appImage, locations]);

  const homepage = safeHomepageUrl(details?.homepage);
  const name = details?.name ?? appImage.name;
  const description = details?.description ?? appImage.description;
  const version = details?.version ?? appImage.version;
  const architecture = details?.architecture ?? appImage.architecture;
  const markdown = [
    escapeMarkdown(description),
    error ? `_${escapeMarkdown(error)}_` : undefined,
    !details && !error ? "_Inspecting embedded AppImage metadata…_" : undefined,
  ].filter(Boolean).join("\n\n");

  return (
    <Detail
      navigationTitle={name}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Source" text="AppImage · Local file" />
          <Detail.Metadata.Label
            title="Integration"
            text={appImage.managedByDepot ? "Managed by Depot" : "External"}
          />
          <Detail.Metadata.Label
            title="AppImage Type"
            text={`Type ${details?.appImageType ?? appImage.appImageType}`}
          />
          {version && (
            <Detail.Metadata.Label
              title="Version"
              text={version}
            />
          )}
          {architecture && (
            <Detail.Metadata.Label
              title="Architecture"
              text={architecture}
            />
          )}
          <Detail.Metadata.Label title="File" text={appImage.fileName} />
          <Detail.Metadata.Label
            title="File Size"
            text={formatFileSize(appImage.fileSize)}
          />
          <Detail.Metadata.Label title="Path" text={appImage.filePath} />
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
          <Action.ShowInFinder
            title="Open AppImage Location"
            path={appImage.filePath}
            select
          />
          <Action.CopyToClipboard
            title="Copy AppImage Path"
            content={appImage.filePath}
          />
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
