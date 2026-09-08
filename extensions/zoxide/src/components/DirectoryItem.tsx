import { Icon, List } from "@vicinae/api";
import { basename, dirname } from "node:path";
import { friendly, pathTokens } from "../lib/path";
import type { Preferences, Program, ZoxideEntry } from "../lib/types";
import { DirectoryActions } from "./DirectoryActions";

interface DirectoryItemProps {
    entry: ZoxideEntry;
    programs: Program[];
    prefs: Preferences;
    onAfterOpen: (entry: ZoxideEntry) => void;
    onRemove: (entry: ZoxideEntry) => void;
}

export function DirectoryItem({ entry, programs, prefs, onAfterOpen, onRemove }: DirectoryItemProps) {
    return (
        <List.Item
            title={basename(entry.path)}
            subtitle={friendly(dirname(entry.path))}
            icon={Icon.Folder}
            keywords={pathTokens(entry.path)}
            accessories={[{ tag: entry.score.toFixed(1) }]}
            actions={
                <DirectoryActions
                    entry={entry}
                    programs={programs}
                    prefs={prefs}
                    onAfterOpen={onAfterOpen}
                    onRemove={onRemove}
                />
            }
        />
    );
}
