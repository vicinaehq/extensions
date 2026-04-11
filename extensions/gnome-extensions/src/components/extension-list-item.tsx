import React, { useMemo } from "react";
import { Action, ActionPanel, Clipboard, Icon, List, showToast, Toast } from "@vicinae/api";
import useExtensionScreenshot from "../hooks/use-extension-screenshot";
import { useExtensionIcon } from "../hooks/use-extension-icon";
import { ExtensionListItemProps } from "../interfaces/extension-list-item-props";
import { executeCommand } from "../utils/execute-command";
import { ActionEnableExtension } from "./action-enable-extension";
import { ActionDisableExtension } from "./action-disable-extension";
import { ExtensionListDetail } from "./extension-list-detail";

async function openExtensionPrefs(uuid: string): Promise<boolean> {
  const { error } = await executeCommand(`gnome-extensions prefs "${uuid}"`);
  return !error;
}

export function ExtensionListItem({ extension, isShowingDetail, onToggleDetail, onReload }: ExtensionListItemProps) {
  const { screenshot, isLoading: isLoadingScreenshot, openScreenshot } = useExtensionScreenshot(extension.uuid);
  const { iconPath, isLoading: isLoadingIcon } = useExtensionIcon(extension.uuid);

  const icon = useMemo(() => {
    if (isLoadingIcon) return Icon.CircleProgress;
    if (iconPath) return iconPath;
    return Icon.Network;
  }, [iconPath, isLoadingIcon]);

  return (
    <List.Item
      key={extension.uuid}
      title={extension.name}
      subtitle={extension.description || extension.uuid}
      icon={icon}
      accessories={extension.version ? [{ text: `v${extension.version}` }] : []}
      detail={<ExtensionListDetail extension={extension} screenshot={screenshot} isLoadingScreenshot={isLoadingScreenshot} />}
      actions={(
        <ActionPanel>
          <Action
            title={isShowingDetail ? "Hide Details" : "Show Details"}
            icon={Icon.Info01}
            onAction={onToggleDetail}
          />
          {extension.hasPrefs && (
            <Action title="Preferences" icon={Icon.Cog} onAction={() => openExtensionPrefs(extension.uuid)} />
          )}
          {screenshot && (
            <Action
              title="Open Screenshot"
              icon={Icon.Image}
              onAction={openScreenshot}
              shortcut={{ modifiers: ["ctrl"], key: "i" }}
            />
          )}
          {extension.enabled ? (
            <ActionDisableExtension extension={extension} onReload={onReload} />
          ) : (
            <ActionEnableExtension extension={extension} onReload={onReload} />
          )}
          <Action
            title="Copy UUID"
            icon={Icon.CopyClipboard}
            shortcut={{ modifiers: ["ctrl"], key: "u" }}
            onAction={async () => {
              await Clipboard.copy(extension.uuid);
              await showToast({ style: Toast.Style.Success, title: "UUID copied" });
            }}
          />
        </ActionPanel>
      )}
    />
  );
}
