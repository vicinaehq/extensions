import {
	Clipboard,
	closeMainWindow,
	getPreferenceValues,
	type Keyboard,
	showHUD,
	showToast,
	Toast,
} from "@vicinae/api";
import { copyProtected } from "./clipboard";

// Keyboard shortcuts using native Linux modifiers. ctrl+shift+<letter> avoids
// the reserved ctrl+alt combinations that desktop environments intercept, and
// each binding uses a distinct letter so none collide with one another.
export const SHORTCUTS: Record<string, Keyboard.Shortcut> = {
	copyPassword: { modifiers: ["ctrl", "shift"], key: "c" },
	copyUsername: { modifiers: ["ctrl", "shift"], key: "u" },
	copyTotp: { modifiers: ["ctrl", "shift"], key: "t" },
	openInBrowser: { modifiers: ["ctrl", "shift"], key: "o" },
};

type CopyPreferences = {
	closeAfterCopy?: boolean;
};

function shouldCloseAfterCopy(): boolean {
	// Opt-in: only close when the user explicitly enables it.
	return getPreferenceValues<CopyPreferences>().closeAfterCopy === true;
}

/**
 * Copy a value to the clipboard with a success notification. Sensitive values
 * (password, TOTP) go through the transient concealed clipboard. When the user
 * has enabled "Close after copy", the launcher closes with an HUD confirmation
 * instead of an in-list toast.
 */
export async function copySecret(
	title: string,
	value: string,
	options: { concealed?: boolean; sensitive?: boolean } = {},
): Promise<void> {
	const { concealed = true, sensitive = false } = options;
	if (sensitive) await copyProtected(value);
	else await Clipboard.copy(value, { concealed });

	if (shouldCloseAfterCopy()) {
		await showHUD(`${title} copied`);
		await closeMainWindow();
		return;
	}
	await showToast({ style: Toast.Style.Success, title: `${title} copied` });
}

/** Get the primary URL for an item (first entry), if any. */
export function primaryUrl(urls?: string[]): string | undefined {
	return urls && urls.length > 0 ? urls[0] : undefined;
}

export type ActionId =
	| "view-details"
	| "copy-username"
	| "copy-password"
	| "copy-totp"
	| "open-browser";

type OrderPreferences = {
	primaryAction?: string;
	secondaryAction?: string;
};

const KNOWN_ACTIONS: ActionId[] = [
	"view-details",
	"copy-username",
	"copy-password",
	"copy-totp",
	"open-browser",
];

function isActionId(value: string | undefined): value is ActionId {
	return !!value && (KNOWN_ACTIONS as string[]).includes(value);
}

/**
 * Resolve the order in which item actions should appear, honouring the user's
 * primary/secondary preferences. Preferred ids move to the front (primary
 * first, then secondary); any available action not named stays in its default
 * order behind them. Only ids present in `available` are returned.
 */
export function orderedActionIds(available: ActionId[]): ActionId[] {
	const prefs = getPreferenceValues<OrderPreferences>();
	const preferred: ActionId[] = [];
	for (const candidate of [prefs.primaryAction, prefs.secondaryAction]) {
		if (
			isActionId(candidate) &&
			available.includes(candidate) &&
			!preferred.includes(candidate)
		)
			preferred.push(candidate);
	}
	const rest = available.filter((id) => !preferred.includes(id));
	return [...preferred, ...rest];
}
