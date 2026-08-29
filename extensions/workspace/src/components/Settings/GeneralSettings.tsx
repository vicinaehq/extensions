import { Action, ActionPanel, Alert, confirmAlert, Icon, List, showToast, Toast, type Application } from "@vicinae/api";

import ImportSettingsForm from "@/components/ImportSettingsForm";
import SelectEditor from "@/components/SelectEditor";
import { App } from "@/types";
import { toApp } from "@/utils/validation";

interface GeneralSettingsProps {
  defaultApp: App | null;
  onExportSettings: () => Promise<void>;
  onImportSettings: (filePath: string) => Promise<boolean>;
  onResetExtension: () => Promise<void>;
  terminalApp: App | null;
  updateDefaultApp: (app: App | null) => Promise<void>;
  updateTerminalApp: (app: App | null) => Promise<void>;
}

export default function GeneralSettings({
  defaultApp,
  onExportSettings,
  onImportSettings,
  onResetExtension,
  terminalApp,
  updateDefaultApp,
  updateTerminalApp,
}: GeneralSettingsProps) {
  const handleDefaultAppSelect = async (app: Application) => {
    await updateDefaultApp(toApp(app));
    await showToast({ message: app.name, style: Toast.Style.Success, title: "App Updated" });
  };

  const handleTerminalSelect = async (app: Application) => {
    await updateTerminalApp(toApp(app));
    await showToast({ message: app.name, style: Toast.Style.Success, title: "Terminal Updated" });
  };

  const handleTerminalReset = async () => {
    await updateTerminalApp(null);
    await showToast({ style: Toast.Style.Success, title: "Terminal Reset" });
  };

  const handleResetExtension = async () => {
    if (
      !(await confirmAlert({
        message: "This removes workspaces, pins, recents, and app settings. You cannot undo this.",
        primaryAction: { style: Alert.ActionStyle.Destructive, title: "Reset Extension" },
        title: "Reset Extension",
      }))
    ) {
      return;
    }

    try {
      await onResetExtension();
      await showToast({ style: Toast.Style.Success, title: "Extension Reset" });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Failed to reset extension" });
    }
  };

  return (
    <List.Item
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Application">
            <Action.Push
              icon={Icon.Pencil}
              target={<SelectEditor onSelect={handleDefaultAppSelect} />}
              title="Change Default App"
            />
            <Action.Push
              icon={Icon.Terminal}
              target={<SelectEditor onReset={handleTerminalReset} onSelect={handleTerminalSelect} />}
              title="Change Terminal"
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Backup">
            <Action icon={Icon.Download} onAction={onExportSettings} title="Export Settings to Downloads" />
            <Action.Push
              icon={Icon.Upload}
              target={<ImportSettingsForm onImport={onImportSettings} />}
              title="Import Settings File"
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Reset">
            <Action
              icon={Icon.Trash}
              onAction={handleResetExtension}
              style={Action.Style.Destructive}
              title="Reset Extension"
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
      detail={
        <List.Item.Detail
          markdown="Choose which app opens your projects. A terminal is optional; if unset, Vicinae uses the system default. Export or import a JSON backup from the action panel, or reset the extension to start over."
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Default App" text={defaultApp?.name || "Not selected"} />
              <List.Item.Detail.Metadata.Label title="Terminal App" text={terminalApp?.name || "System default"} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Backup" text="Export or import from the action panel" />
              <List.Item.Detail.Metadata.Label title="Reset" text="Clear all data from the action panel" />
            </List.Item.Detail.Metadata>
          }
        />
      }
      icon={Icon.AppWindow}
      id="general"
      keywords={["app", "terminal", "backup", "export", "import", "reset"]}
      title="General"
    />
  );
}
