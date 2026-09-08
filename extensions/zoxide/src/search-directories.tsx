import { Icon, List, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { DirectoryItem } from "./components/DirectoryItem";
import { friendly } from "./lib/path";
import { buildPrograms } from "./lib/programs";
import type { Preferences, ZoxideEntry } from "./lib/types";
import { queryAll, removePath } from "./lib/zoxide";

export default function SearchDirectories() {
    const prefs = useMemo(() => getPreferenceValues<Preferences>(), []);
    const programs = useMemo(() => buildPrograms(prefs), [prefs]);
    const [entries, setEntries] = useState<ZoxideEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await queryAll(prefs.extraPath);
                if (!cancelled) setEntries(result);
            } catch (e) {
                if (!cancelled) {
                    await showToast({
                        style: Toast.Style.Failure,
                        title: "zoxide query failed",
                        message: e instanceof Error ? e.message : String(e),
                    });
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [prefs.extraPath]);

    const handleAfterOpen = (_entry: ZoxideEntry) => {
        // zoxide tracks frecency in its own db; UI doesn't need to mutate score locally
    };

    const handleRemove = async (entry: ZoxideEntry) => {
        const previous = entries;
        setEntries((curr) => curr.filter((e) => e.path !== entry.path));
        try {
            await removePath(entry.path, prefs.extraPath);
            await showToast({
                style: Toast.Style.Success,
                title: "Removed",
                message: friendly(entry.path),
            });
        } catch (e) {
            setEntries(previous);
            await showToast({
                style: Toast.Style.Failure,
                title: "Failed to remove",
                message: e instanceof Error ? e.message : String(e),
            });
        }
    };

    return (
        <List isLoading={isLoading} searchBarPlaceholder="Search frecent directories">
            <List.Section title="Directories" subtitle={`${entries.length}`}>
                {entries.map((entry) => (
                    <DirectoryItem
                        key={entry.path}
                        entry={entry}
                        programs={programs}
                        prefs={prefs}
                        onAfterOpen={handleAfterOpen}
                        onRemove={handleRemove}
                    />
                ))}
            </List.Section>
            <List.EmptyView
                title="No directories"
                description="zoxide returned nothing. Make sure 'zoxide' is in PATH (or set the Extra PATH preference)."
                icon={Icon.Folder}
            />
        </List>
    );
}
