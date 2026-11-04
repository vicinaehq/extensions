import type { Keyboard } from "@vicinae/api";

// Match the host platform's primary keyboard modifier.
const primaryModifier: "cmd" | "ctrl" =
	process.platform === "darwin" ? "cmd" : "ctrl";

export const SHORTCUTS: Record<string, Keyboard.Shortcut> = {
	copyCurrent: { modifiers: [primaryModifier, "shift"], key: "c" },
	copyNext: { modifiers: [primaryModifier, "shift"], key: "n" },
	pasteNext: { modifiers: [primaryModifier, "shift"], key: "p" },
	viewDetails: { modifiers: [primaryModifier, "shift"], key: "d" },
	openNotesUrl: { modifiers: [primaryModifier, "shift"], key: "o" },
	refreshExport: { modifiers: [primaryModifier, "shift"], key: "e" },
	refresh: { modifiers: [primaryModifier, "shift"], key: "r" },
	reloadExport: { modifiers: [primaryModifier, "shift"], key: "l" },
	retry: { modifiers: [primaryModifier, "shift"], key: "y" },
	openCliGuide: { modifiers: [primaryModifier, "shift"], key: "g" },
};
