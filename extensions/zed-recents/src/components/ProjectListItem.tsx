import { Color, Icon, List } from "@vicinae/api";
import { ProjectActions } from "./ProjectActions";
import type { RecentProject } from "../types";

interface ProjectListItemProps {
    project: RecentProject;
    onRemove: () => void;
}

export function ProjectListItem({ project, onRemove }: ProjectListItemProps) {
    const title = project.remote ? `${project.label} [${formatRemote(project.remote)}]` : project.label;

    const accessories: List.Item.Accessory[] = [
        {
            icon: project.isDirectory ? Icon.Folder : Icon.BlankDocument,
            tag: project.isDirectory ? "Folder" : "File",
        },
    ];
    if (!project.exists) {
        accessories.push({ tag: { value: "Missing", color: Color.SecondaryText } });
    }
    if (project.remote) {
        accessories.push({ tag: project.remote.kind, icon: Icon.Globe01 });
    }

    return (
        <List.Item
            title={title}
            subtitle={project.path}
            icon={project.isDirectory ? Icon.Folder : Icon.BlankDocument}
            keywords={project.keywords}
            accessories={accessories}
            actions={<ProjectActions project={project} onRemove={onRemove} />}
        />
    );
}

function formatRemote(remote: RecentProject["remote"]): string {
    if (!remote) return "";
    if (remote.name) return remote.name;
    if (remote.host) {
        const userPrefix = remote.user ? `${remote.user}@` : "";
        const portSuffix = remote.port ? `:${remote.port}` : "";
        return `${userPrefix}${remote.host}${portSuffix}`;
    }
    return remote.kind;
}
