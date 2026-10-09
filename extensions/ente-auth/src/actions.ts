import type { Keyboard } from "@vicinae/api";

export const SHORTCUTS: Record<string, Keyboard.Shortcut> = {
	copyCurrent: { modifiers: ["ctrl", "shift"], key: "c" },
	copyNext: { modifiers: ["ctrl", "shift"], key: "n" },
	pasteNext: { modifiers: ["ctrl", "shift"], key: "p" },
	viewDetails: { modifiers: ["ctrl", "shift"], key: "d" },
	openNotesUrl: { modifiers: ["ctrl", "shift"], key: "o" },
	refreshExport: { modifiers: ["ctrl", "shift"], key: "e" },
	refresh: { modifiers: ["ctrl", "shift"], key: "r" },
	reloadExport: { modifiers: ["ctrl", "shift"], key: "l" },
	retry: { modifiers: ["ctrl", "shift"], key: "y" },
	openCliGuide: { modifiers: ["ctrl", "shift"], key: "g" },
};
