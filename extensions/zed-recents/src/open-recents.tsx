import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { ProjectListItem } from "./components/ProjectListItem";
import { useRecents } from "./hooks/use-recents";
import { getDbPath } from "./zed-db";

export default function Command() {
    const { projects, isLoading, diagnostics, removeItem } = useRecents();

    if (!isLoading && projects.length === 0) {
        let dbPath: string;
        try {
            dbPath = getDbPath();
        } catch {
            dbPath = "~/.local/share/zed/db/";
        }
        return (
            <List searchBarPlaceholder="Search recent projects">
                <List.EmptyView
                    title="No recent projects found"
                    description={diagnostics ?? "Open a folder in Zed first."}
                    icon={Icon.Folder}
                    actions={
                        <ActionPanel>
                            <Action.CopyToClipboard title="Copy Database Path" content={dbPath} />
                        </ActionPanel>
                    }
                />
            </List>
        );
    }

    const folders = projects.filter((p) => p.isDirectory);
    const files = projects.filter((p) => !p.isDirectory);

    return (
        <List isLoading={isLoading} searchBarPlaceholder="Search recent projects">
            <List.Section title="Folders" subtitle={`${folders.length}`}>
                {folders.map((project) => (
                    <ProjectListItem project={project} key={project.path} onRemove={() => removeItem(project)} />
                ))}
            </List.Section>
            {files.length > 0 && (
                <List.Section title="Files" subtitle={`${files.length}`}>
                    {files.map((project) => (
                        <ProjectListItem project={project} key={project.path} onRemove={() => removeItem(project)} />
                    ))}
                </List.Section>
            )}
            <List.EmptyView icon={Icon.BlankDocument} title="No Matching Projects" description="Try a different search term." />
        </List>
    );
}
