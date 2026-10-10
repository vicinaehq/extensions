import { Action, ActionPanel, Icon, closeMainWindow, showToast, Toast } from "@vicinae/api";
import { addPath } from "../lib/zoxide";
import { spawnDetached } from "../lib/terminal";
import type { Preferences, Program, ZoxideEntry } from "../lib/types";

interface DirectoryActionsProps {
    entry: ZoxideEntry;
    programs: Program[];
    prefs: Preferences;
    onAfterOpen: (entry: ZoxideEntry) => void;
    onRemove: (entry: ZoxideEntry) => void;
}

const PROGRAM_ICONS: Record<string, Icon> = {
    terminal: Icon.Terminal,
    editor: Icon.Code,
    fileManager: Icon.Folder,
    program1: Icon.AppWindow,
    program2: Icon.AppWindow,
    program3: Icon.AppWindow,
    program4: Icon.AppWindow,
    program5: Icon.AppWindow,
};

export function DirectoryActions({ entry, programs, prefs, onAfterOpen, onRemove }: DirectoryActionsProps) {
    return (
        <ActionPanel>
            <ActionPanel.Section title="Open">
                {programs.map((program) => (
                    <Action
                        key={program.id}
                        title={program.label}
                        icon={PROGRAM_ICONS[program.id] ?? Icon.AppWindow}
                        shortcut={program.shortcut}
                        onAction={async () => {
                            try {
                                const args = program.spawnInTerminal
                                    ? []
                                    : (program.argv?.(entry.path) ?? [entry.path]);
                                spawnDetached(program.cmd, {
                                    cwd: entry.path,
                                    args,
                                    extraPath: prefs.extraPath,
                                });
                                try {
                                    await addPath(entry.path, prefs.extraPath);
                                } catch (e) {
                                    // best-effort frecency bump; don't block the open
                                    console.error("zoxide add failed:", e);
                                }
                                onAfterOpen(entry);
                                closeMainWindow();
                            } catch (e) {
                                await showToast({
                                    style: Toast.Style.Failure,
                                    title: `Failed to open with ${program.label}`,
                                    message: e instanceof Error ? e.message : String(e),
                                });
                            }
                        }}
                    />
                ))}
            </ActionPanel.Section>
            <ActionPanel.Section title="Clipboard">
                <Action.CopyToClipboard
                    title="Copy Path"
                    content={entry.path}
                    icon={Icon.CopyClipboard}
                    shortcut={{ modifiers: ["ctrl"], key: "c" }}
                />
            </ActionPanel.Section>
            <ActionPanel.Section title="Manage">
                <Action
                    title="Remove from zoxide"
                    style={Action.Style.Destructive}
                    icon={Icon.Trash}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={() => onRemove(entry)}
                />
            </ActionPanel.Section>
        </ActionPanel>
    );
}
