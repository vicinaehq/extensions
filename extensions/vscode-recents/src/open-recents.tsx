import { Icon, List } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { ErrorView } from "./components/ErrorView";
import { ProjectListItem } from "./components/ProjectListItem";
import { ProjectType, type RecentProject } from "./types";
import { getRecentProjects } from "./util/projects";

type TypeFilter = "all" | "folders" | "workspaces" | "files";

export default function Command() {
    const [error, setError] = useState<Error>();
    const [isLoading, setIsLoading] = useState(true);
    const [projects, setProjects] = useState<RecentProject[]>([]);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

    const loadProjects = useCallback(async () => {
        setIsLoading(true);
        try {
            const recentProjects = await getRecentProjects();
            setProjects(recentProjects);
            setError(undefined);
        } catch (error) {
            setProjects([]);
            setError(error as Error);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    if (error) {
        return <ErrorView error={error} />;
    }

    const folders = projects.filter((p) => p.type === ProjectType.Folder);
    const workspaces = projects.filter((p) => p.type === ProjectType.Workspace);
    const files = projects.filter((p) => p.type === ProjectType.File);

    const showFolders = typeFilter === "all" || typeFilter === "folders";
    const showWorkspaces = typeFilter === "all" || typeFilter === "workspaces";
    const showFiles = typeFilter === "all" || typeFilter === "files";

    const searchBarAccessory = (
        <List.Dropdown
            tooltip="Filter by type"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as TypeFilter)}
            placeholder="Filter..."
        >
            <List.Dropdown.Item title="All" value="all" icon={Icon.AppWindow} />
            <List.Dropdown.Item title="Folders" value="folders" icon={Icon.Folder} />
            <List.Dropdown.Item title="Workspaces" value="workspaces" icon={Icon.AppWindowGrid2x2} />
            <List.Dropdown.Item title="Files" value="files" icon={Icon.BlankDocument} />
        </List.Dropdown>
    );

    return (
        <List isLoading={isLoading} searchBarPlaceholder="Search recent projects" searchBarAccessory={searchBarAccessory}>
            {showFolders && (
                <List.Section title="Folders" subtitle={`${folders.length}`}>
                    {folders.map((project, index) => (
                        <ProjectListItem index={index} project={project} key={`${project.path}-${index}`} onRemove={loadProjects} />
                    ))}
                </List.Section>
            )}
            {showWorkspaces && (
                <List.Section title="Workspaces" subtitle={`${workspaces.length}`}>
                    {workspaces.map((project, index) => (
                        <ProjectListItem index={index} project={project} key={`${project.path}-${index}`} onRemove={loadProjects} />
                    ))}
                </List.Section>
            )}
            {showFiles && (
                <List.Section title="Files" subtitle={`${files.length}`}>
                    {files.map((project, index) => (
                        <ProjectListItem index={index} project={project} key={`${project.path}-${index}`} onRemove={loadProjects} />
                    ))}
                </List.Section>
            )}
            <List.EmptyView icon={Icon.Document} title="No Recent Projects Found" description="No recent VSCode projects available." />
        </List>
    );
}
