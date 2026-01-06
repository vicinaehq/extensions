import { List, Icon } from "@vicinae/api";
import { ProjectActions } from "./ProjectActions";
import { RecentProject, ProjectType, ProjectEnvironment } from "../types";

interface ProjectListItemProps {
    project: RecentProject;
    index: number;
    onRemove?: () => void;
}

function getProjectIcon(type: ProjectType): Icon {
    switch (type) {
        case ProjectType.Workspace:
            return Icon.Document;
        case ProjectType.Folder:
            return Icon.Folder;
        case ProjectType.File:
            return Icon.BlankDocument;
        default:
            return Icon.QuestionMark;
    }
}

function getProjectTypeLabel(type: ProjectType): List.Item.Tag {
    switch (type) {
        case ProjectType.Workspace:
            return "Workspace";
        case ProjectType.Folder:
            return "Folder";
        case ProjectType.File:
            return "File";
        default:
            return "Unknown";
    }
}

export function ProjectListItem({ project, index, onRemove }: ProjectListItemProps) {
    const hasExistingSSHInfo = /\[SSH:\s*[^\]]+\]/.test(project.label);
    const hasExistingDevContainerInfo = /\[Dev Container\]/.test(project.label);

    let title = project.label;
    // VSCode already includes "tags" in the project label occasionally
    // but it is extremely inconsistent, so we add them ourselves for clarity
    if (project.environment === ProjectEnvironment.RemoteSSH && project.machineName && !hasExistingSSHInfo) {
        title = `${project.label} [SSH: ${project.machineName}]`;
    } else if (project.environment === ProjectEnvironment.DevContainer && !hasExistingDevContainerInfo) {
        title = `${project.label} [Dev Container]`;
    }

    return (
        <List.Item
            title={title}
            subtitle={project.path}
            icon={getProjectIcon(project.type)}
            key={`${project.path}-${index}`}
            accessories={[
                {
                    icon: getProjectIcon(project.type),
                    tag: getProjectTypeLabel(project.type),
                },
            ]}
            actions={<ProjectActions project={project} onRemove={onRemove} />}
        />
    );
}
