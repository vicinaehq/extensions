import React from "react";
import { ExtensionAction } from "../interfaces/extension-action";
import { Action, Icon, showToast, Toast } from "@vicinae/api";
import { executeCommand } from "../utils/execute-command";

async function enableExtension(uuid: string): Promise<boolean> {
  const { error } = await executeCommand(`gnome-extensions enable "${uuid}"`);
  return !error;
}

export const ActionEnableExtension = ({ extension, onReload }: ExtensionAction) => (
  <Action
    title="Enable"
    icon={Icon.CheckCircle}
    shortcut={{ modifiers: ["ctrl"], key: "e" }}
    onAction={async () => {
      const success = await enableExtension(extension.uuid);

      if (success) {
        await showToast({ style: Toast.Style.Success, title: "Enabled", message: extension.name });
        onReload();
        return;
      }

      await showToast({ style: Toast.Style.Failure, title: "Failed to enable", message: extension.name });
    }}
  />
);
