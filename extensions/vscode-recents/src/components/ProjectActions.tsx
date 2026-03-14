import { Action, ActionPanel, closeMainWindow, Icon, showInFileBrowser, showToast, Toast } from "@vicinae/api";
import { VSCODE_FLAVOURS } from "../constants";
import { ProjectEnvironment, type RecentProject, type VSCodeFlavour } from "../types";
import { removeRecentProject } from "../util/database";
import { openProjectInVSCode } from "../util/vscode";

interface ProjectActionsProps {
    project: RecentProject;
    onRemove?: () => void;
}

export function ProjectActions({ project, onRemove }: ProjectActionsProps) {
    return (
        <ActionPanel>
            <Action
                icon={Icon.Code}
                title="Open in Editor"
                onAction={async () => {
                    closeMainWindow();
                    await openProjectInVSCode(project);
                }}
                shortcut={{ modifiers: [], key: "enter" }}
            />
            <ActionPanel.Submenu title="Open in..." icon={Icon.AppWindow}>
                {VSCODE_FLAVOURS.map(({ value, label }) => (
                    <Action
                        key={value}
                        title={`Open in ${label}`}
                        onAction={async () => {
                            closeMainWindow();
                            await openProjectInVSCode(project, value as VSCodeFlavour);
                        }}
                    />
                ))}
            </ActionPanel.Submenu>
            {project.environment === ProjectEnvironment.Local && (
                <Action
                    icon={Icon.Folder}
                    title="Show in File Manager"
                    onAction={() => {
                        closeMainWindow();
                        showInFileBrowser(project.path);
                    }}
                    shortcut={{ modifiers: ["opt"], key: "enter" }}
                />
            )}
            <Action.CopyToClipboard
                title="Copy Path"
                content={project.path}
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["ctrl"], key: "c" }}
            />
            {onRemove && (
                <Action
                    icon={Icon.Trash}
                    title="Remove from Recents"
                    style={Action.Style.Destructive}
                    onAction={async () => {
                        try {
                            await showToast({
                                style: Toast.Style.Animated,
                                title: "Removing from recents...",
                            });
                            await removeRecentProject(project.path);
                            await showToast({
                                style: Toast.Style.Success,
                                title: "Removed from recents",
                            });
                            onRemove();
                        } catch (error) {
                            await showToast({
                                style: Toast.Style.Failure,
                                message: (error as Error).message,
                                title: "Failed to remove from recents",
                            });
                        }
                    }}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                />
            )}
        </ActionPanel>
    );
}
