import React from "react";
import { ExtensionAction } from "../interfaces/extension-action";
import { Action, Icon, showToast, Toast } from "@vicinae/api";
import { executeCommand } from "../utils/execute-command";

async function disableExtension(uuid: string): Promise<boolean> {
  const { error } = await executeCommand(`gnome-extensions disable "${uuid}"`);
  return !error;
}

export const ActionDisableExtension = ({ extension, onReload }: ExtensionAction) => (
  <Action
    title="Disable"
    icon={Icon.XMarkCircle}
    shortcut={{ modifiers: ["ctrl"], key: "d" }}
    onAction={async () => {
      const success = await disableExtension(extension.uuid);

      if (success) {
        await showToast({ style: Toast.Style.Success, title: "Disabled", message: extension.name });
        onReload();
        return;
      }

      await showToast({ style: Toast.Style.Failure, title: "Failed to disable", message: extension.name });
    }}
  />
);
