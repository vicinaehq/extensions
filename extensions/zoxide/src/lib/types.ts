export interface Preferences {
    terminal?: string;
    editor?: string;
    fileManager?: string;
    program1Cmd?: string;
    program1Label?: string;
    program2Cmd?: string;
    program2Label?: string;
    program3Cmd?: string;
    program3Label?: string;
    program4Cmd?: string;
    program4Label?: string;
    program5Cmd?: string;
    program5Label?: string;
    extraPath?: string;
}

export interface ZoxideEntry {
    score: number;
    path: string;
}

import type { Keyboard } from "@vicinae/api";

export interface Program {
    id: string;
    cmd: string;
    label: string;
    shortcut?: Keyboard.Shortcut;
    argv?: (path: string) => string[];
    spawnInTerminal?: boolean;
}
