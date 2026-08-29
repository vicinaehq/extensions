import { Action, ActionPanel, Alert, confirmAlert, Icon, List, showToast, Toast, type Application } from "@vicinae/api";
import path from "path";

import AddWorkspaceForm from "@/components/AddWorkspaceForm";
import SelectEditor from "@/components/SelectEditor";
import { App } from "@/types";
import { SHORTCUT_MOVE_DOWN, SHORTCUT_MOVE_UP } from "@/utils/constants";
import { listItemId } from "@/utils/paths";
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

  async function moveWorkspace(workspacePath: string, direction: "down" | "up") {
    const index = workspaces.indexOf(workspacePath);
    if (index === -1) {
      return;
    }

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
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  {index > 0 && (
                    <Action
                      icon={Icon.ChevronUp}
                      onAction={() => moveWorkspace(workspace, "up")}
                      shortcut={SHORTCUT_MOVE_UP}
                      title="Move Up"
                    />
                  )}
                  {index < workspaces.length - 1 && (
                    <Action
                      icon={Icon.ChevronDown}
                      onAction={() => moveWorkspace(workspace, "down")}
                      shortcut={SHORTCUT_MOVE_DOWN}
                      title="Move Down"
                    />
                  )}
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
            detail={
              <List.Item.Detail
                markdown={`\`${workspace}\`\n\nOpen this workspace's projects with a custom app, or leave it on the default. Reorder, copy the path, or remove the folder from the action panel.`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Path" text={workspace} />
                    <List.Item.Detail.Metadata.Label title="App" text={workspaceApp?.name || "Default app"} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            icon={Icon.Folder}
            id={listItemId(workspace)}
            key={listItemId(workspace)}
            keywords={[workspace, path.basename(workspace)]}
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
        detail={
          <List.Item.Detail markdown="Add a parent folder that contains your projects. Each top-level folder inside it becomes a project in the Workspace list." />
        }
        icon={Icon.Plus}
        id="add-workspace"
        title="Add Workspace"
      />
    </List.Section>
  );
}
