import type { Preferences, Program } from "./types";
import { detectTerminal } from "./terminal";

export function buildPrograms(prefs: Preferences): Program[] {
    const programs: Program[] = [];

    const terminalCmd = prefs.terminal && prefs.terminal.length > 0 ? prefs.terminal : detectTerminal(prefs.extraPath);
    programs.push({
        id: "terminal",
        cmd: terminalCmd,
        label: "Open in Terminal",
        shortcut: { modifiers: [], key: "enter" },
        spawnInTerminal: true,
    });

    if (prefs.editor !== "-") {
        const editorCmd = prefs.editor && prefs.editor.length > 0 ? prefs.editor : "code";
        programs.push({
            id: "editor",
            cmd: editorCmd,
            label: "Open in Editor",
            shortcut: { modifiers: ["ctrl"], key: "e" },
            argv: (p) => [p],
        });
    }

    const fileManagerCmd = prefs.fileManager && prefs.fileManager.length > 0 ? prefs.fileManager : "xdg-open";
    programs.push({
        id: "fileManager",
        cmd: fileManagerCmd,
        label: "Open in File Manager",
        shortcut: { modifiers: ["ctrl"], key: "f" },
        argv: (p) => [p],
    });

    const slots = [
        { cmd: prefs.program1Cmd, label: prefs.program1Label, n: "1" as const },
        { cmd: prefs.program2Cmd, label: prefs.program2Label, n: "2" as const },
        { cmd: prefs.program3Cmd, label: prefs.program3Label, n: "3" as const },
        { cmd: prefs.program4Cmd, label: prefs.program4Label, n: "4" as const },
        { cmd: prefs.program5Cmd, label: prefs.program5Label, n: "5" as const },
    ];
    for (const s of slots) {
        if (!s.cmd || s.cmd.length === 0) continue;
        programs.push({
            id: `program${s.n}`,
            cmd: s.cmd,
            label: s.label && s.label.length > 0 ? s.label : s.cmd,
            shortcut: { modifiers: ["ctrl"], key: s.n },
            argv: (p) => [p],
        });
    }

    return programs;
}
