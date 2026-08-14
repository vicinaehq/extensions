import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
  type Application,
} from "@vicinae/api";
import path from "path";

import AddWorkspaceForm from "@/components/AddWorkspaceForm";
import SelectEditor from "@/components/SelectEditor";
import { App } from "@/types";
import { toApp } from "@/utils/validation";

interface ManagedWorkspacesSectionProps {
  loadData: () => Promise<void>;
  onWorkspacesChanged?: () => Promise<void>;
  updateWorkspaceApps: (newWorkspaceApps: Record<string, App>) => Promise<void>;
  updateWorkspaces: (newWorkspaces: string[]) => Promise<void>;
  workspaceApps: Record<string, App>;
  workspaces: string[];
}

export default function ManagedWorkspacesSection({
  loadData,
  onWorkspacesChanged,
  updateWorkspaceApps,
  updateWorkspaces,
  workspaceApps,
  workspaces,
}: ManagedWorkspacesSectionProps) {
  async function removeWorkspace(workspacePath: string) {
    if (
      await confirmAlert({
        message: `Remove "${path.basename(workspacePath)}" from your workspace projects?`,
        primaryAction: { style: Alert.ActionStyle.Destructive, title: "Remove" },
        title: "Remove Workspace",
      })
    ) {
      try {
        const newWorkspaces = workspaces.filter((item) => item !== workspacePath);
        await updateWorkspaces(newWorkspaces);

        const newWorkspaceApps = { ...workspaceApps };
        delete newWorkspaceApps[workspacePath];
        await updateWorkspaceApps(newWorkspaceApps);

        if (onWorkspacesChanged) {
          await onWorkspacesChanged();
        }

        await showToast({ style: Toast.Style.Success, title: "Workspace Removed" });
      } catch {
        await showToast({ style: Toast.Style.Failure, title: "Failed to remove workspace" });
      }
    }
  }

  async function setWorkspaceApp(workspacePath: string, app: Application) {
    try {
      const newWorkspaceApps = {
        ...workspaceApps,
        [workspacePath]: toApp(app),
      };

      await updateWorkspaceApps(newWorkspaceApps);

      await showToast({
        message: `${path.basename(workspacePath)} → ${app.name}`,
        style: Toast.Style.Success,
        title: "App Updated",
      });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Failed to update app" });
    }
  }

  async function resetWorkspaceApp(workspacePath: string) {
    try {
      const newWorkspaceApps = { ...workspaceApps };
      delete newWorkspaceApps[workspacePath];

      await updateWorkspaceApps(newWorkspaceApps);

      await showToast({ style: Toast.Style.Success, title: "Application Reset" });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Failed to reset app" });
    }
  }

  async function moveWorkspace(index: number, direction: "down" | "up") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= workspaces.length) {
      return;
    }

    try {
      const newWorkspaces = [...workspaces];
      const [moved] = newWorkspaces.splice(index, 1);

      newWorkspaces.splice(newIndex, 0, moved);

      await updateWorkspaces(newWorkspaces);

      if (onWorkspacesChanged) {
        await onWorkspacesChanged();
      }

      await showToast({ style: Toast.Style.Success, title: "Workspace Moved" });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Failed to move workspace" });
    }
  }

  return (
    <List.Section title="Managed Workspaces">
      {workspaces.map((workspace, index) => {
        const workspaceApp = workspaceApps[workspace];
        return (
          <List.Item
            accessories={
              workspaceApp
                ? [
                    {
                      tag: { color: Color.SecondaryText, value: workspaceApp.name },
                      tooltip: "Custom App Set",
                    },
                  ]
                : []
            }
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.Push
                    icon={Icon.Pencil}
                    target={
                      <SelectEditor
                        onReset={() => resetWorkspaceApp(workspace)}
                        onSelect={(app) => setWorkspaceApp(workspace, app)}
                      />
                    }
                    title="Set Workspace App"
                  />
                  {index > 0 && (
                    <Action
                      icon={Icon.ChevronUp}
                      onAction={() => moveWorkspace(index, "up")}
                      shortcut={{ key: "arrowUp", modifiers: ["cmd", "opt"] }}
                      title="Move up"
                    />
                  )}
                  {index < workspaces.length - 1 && (
                    <Action
                      icon={Icon.ChevronDown}
                      onAction={() => moveWorkspace(index, "down")}
                      shortcut={{ key: "arrowDown", modifiers: ["cmd", "opt"] }}
                      title="Move Down"
                    />
                  )}
                </ActionPanel.Section>
                <ActionPanel.Section>
                  {workspaceApp && (
                    <Action
                      icon={Icon.XMarkCircle}
                      onAction={() => resetWorkspaceApp(workspace)}
                      shortcut={{ key: "backspace", modifiers: ["cmd", "shift"] }}
                      title="Remove Workspace Application"
                    />
                  )}
                  <Action
                    icon={Icon.Trash}
                    onAction={() => removeWorkspace(workspace)}
                    style={Action.Style.Destructive}
                    title="Remove Workspace"
                  />
                </ActionPanel.Section>
                <ActionPanel.Section title="Copy">
                  <Action.CopyToClipboard content={path.basename(workspace)} title="Copy Workspace Name" />
                  <Action.CopyToClipboard
                    content={workspace}
                    shortcut={{ key: "c", modifiers: ["cmd", "shift"] }}
                    title="Copy Workspace Path"
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
            icon={Icon.Folder}
            key={workspace}
            subtitle={workspace}
            title={path.basename(workspace)}
          />
        );
      })}
      <List.Item
        actions={
          <ActionPanel>
            <ActionPanel.Section title="Workspace">
              <Action.Push target={<AddWorkspaceForm onDone={loadData} />} title="Add Workspace" />
            </ActionPanel.Section>
          </ActionPanel>
        }
        icon={Icon.Plus}
        title="Add Workspace"
      />
    </List.Section>
  );
}
