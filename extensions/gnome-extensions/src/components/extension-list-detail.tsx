import React, { useMemo } from "react";
import { ExtensionDetailProps } from "../interfaces/extension-detail-props";
import { List } from "@vicinae/api";

export const ExtensionListDetail = ({ extension, screenshot, isLoadingScreenshot }: ExtensionDetailProps) => {
  const markdown = useMemo(() => {
    if (isLoadingScreenshot) return extension.description || "_No description available._";
    if (screenshot) return `![](${screenshot})\n\n${extension.description || ""}`;
    return extension.description || "_No description available._";
  }, [extension.description, isLoadingScreenshot, screenshot]);

  return (
    <List.Item.Detail
      markdown={markdown}
      metadata={(
        <List.Item.Detail.Metadata>
          {extension.url && (
            <List.Item.Detail.Metadata.Link title="Homepage" text={extension.url} target={extension.url} />
          )}
          {extension.author && <List.Item.Detail.Metadata.Label title="Author" text={extension.author} />}
          <List.Item.Detail.Metadata.Label title="UUID" text={extension.uuid} />
          {extension.version && <List.Item.Detail.Metadata.Label title="Version" text={extension.version} />}
          {extension.state && <List.Item.Detail.Metadata.Label title="State" text={extension.state} />}
          <List.Item.Detail.Metadata.Label title="Status" text={extension.enabled ? "Enabled" : "Disabled"} />
          {extension.settingsSchema && (
            <List.Item.Detail.Metadata.Label title="Schema" text={extension.settingsSchema} />
          )}
          {extension.path && <List.Item.Detail.Metadata.Label title="Path" text={extension.path} />}
        </List.Item.Detail.Metadata>
      )}
    />
  );
};
