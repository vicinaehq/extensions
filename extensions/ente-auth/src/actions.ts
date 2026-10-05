import type { Keyboard } from "@vicinae/api";

export const SHORTCUTS: Record<string, Keyboard.Shortcut> = {
	copyCurrent: { modifiers: ["ctrl", "shift"], key: "c" },
	copyNext: { modifiers: ["ctrl", "shift"], key: "n" },
	refresh: { modifiers: ["ctrl", "shift"], key: "r" },
};
