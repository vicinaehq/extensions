import { Keyboard } from "@vicinae/api";

/** Must match the run command's `name` in package.json — it maps to src/run-prompt.tsx. */
export const RUN_COMMAND = "run-prompt";

// @vicinae/api declares Keyboard.Shortcut.Common members as plain strings (still
// the case in 0.24), so the `shortcut` prop needs a cast. Centralized here; drop
// these when the typings are fixed upstream.
export const SHORTCUT_COPY = Keyboard.Shortcut.Common.Copy as Keyboard.Shortcut.Common;
export const SHORTCUT_NEW = Keyboard.Shortcut.Common.New as Keyboard.Shortcut.Common;
export const SHORTCUT_COPY_DEEPLINK = Keyboard.Shortcut.Common.CopyDeeplink as Keyboard.Shortcut.Common;
export const SHORTCUT_REMOVE = Keyboard.Shortcut.Common.Remove as Keyboard.Shortcut.Common;
export const SHORTCUT_REMOVE_ALL = Keyboard.Shortcut.Common.RemoveAll as Keyboard.Shortcut.Common;

export const SHORTCUT_REPLY: Keyboard.Shortcut = { key: "r", modifiers: ["cmd"] };
export const SHORTCUT_PASTE: Keyboard.Shortcut = { key: "return", modifiers: ["shift"] };
