import { Action, ActionPanel, Icon, closeMainWindow, showInFileBrowser } from "@vicinae/api";
import type { RecentProject } from "../types";
import { openProject } from "../zed-cli";

interface ProjectActionsProps {
    project: RecentProject;
    onRemove: () => void;
}

export function ProjectActions({ project, onRemove }: ProjectActionsProps) {
    return (
        <ActionPanel>
            <Action
                icon={Icon.Code}
                title="Open in Zed"
                onAction={async () => {
                    closeMainWindow();
                    await openProject(project);
                }}
                shortcut={{ modifiers: [], key: "enter" }}
            />
            {!project.remote && (
                <Action.ShowInFinder
                    icon={Icon.Folder}
                    title="Show in file browser"
                    path={project.path}
                    shortcut={{ modifiers: ["shift"], key: "enter" }}
                />
            )}
            <Action.CopyToClipboard
                title="Copy Path"
                content={project.path}
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["ctrl"], key: "c" }}
            />
            <Action
                icon={Icon.Trash}
                title="Remove from Recents"
                style={Action.Style.Destructive}
                onAction={onRemove}
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
            />
        </ActionPanel>
    );
}
