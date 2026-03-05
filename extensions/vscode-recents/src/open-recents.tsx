import { Icon, List } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { ErrorView } from "./components/ErrorView";
import { ProjectListItem } from "./components/ProjectListItem";
import { ProjectType, type RecentProject } from "./types";
import { getRecentProjects } from "./util/projects";

export default function Command() {
    const [error, setError] = useState<Error>();
    const [isLoading, setIsLoading] = useState(true);
    const [projects, setProjects] = useState<RecentProject[]>([]);

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

    const folders = projects.filter((p) => p.type === ProjectType.Folder || p.type === ProjectType.Workspace);
    const files = projects.filter((p) => p.type === ProjectType.File);

    return (
        <List isLoading={isLoading} searchBarPlaceholder="Search recent projects">
            <List.Section title="Folders" subtitle={`${folders.length}`}>
                {folders.map((project, index) => (
                    <ProjectListItem index={index} project={project} key={`${project.path}-${index}`} onRemove={loadProjects} />
                ))}
            </List.Section>
            {files.length > 0 && (
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
