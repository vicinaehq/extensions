import {
	Clipboard,
	Color,
	closeMainWindow,
	getPreferenceValues,
	Icon,
	type Keyboard,
	showHUD,
	showToast,
	Toast,
} from "@vicinae/api";
import { errorMessage, parseVaultColorPreference } from "./cli-contract";
import { copyProtected } from "./clipboard";

/**
 * Run an action, surfacing any failure as a toast rather than an unhandled
 * rejection. Shared by every command so error handling stays consistent.
 */
export async function guardAction(
	title: string,
	action: () => Promise<void>,
): Promise<void> {
	try {
		await action();
	} catch (reason: unknown) {
		await showToast({
			style: Toast.Style.Failure,
			title,
			message: errorMessage(reason),
		});
	}
}

/** guardAction with the extension's standard failure title. */
export const safely = (action: () => Promise<void>): Promise<void> =>
	guardAction("Proton Pass action failed", action);

// Keyboard shortcuts using native Linux modifiers. ctrl+shift+<letter> avoids
// the reserved ctrl+alt combinations that desktop environments intercept, and
// each binding uses a distinct letter so none collide with one another.
export const SHORTCUTS: Record<string, Keyboard.Shortcut> = {
	copyPassword: { modifiers: ["ctrl", "shift"], key: "c" },
	copyUsername: { modifiers: ["ctrl", "shift"], key: "u" },
	copyTotp: { modifiers: ["ctrl", "shift"], key: "t" },
	openInBrowser: { modifiers: ["ctrl", "shift"], key: "o" },
	copyExpiry: { modifiers: ["ctrl"], key: "d" },
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

// Vault role indicator, matching the Raycast Proton Pass extension: the role
// (owner/manager/editor/viewer) is the meaningful per-vault signal, shown as a
// coloured, iconed tag. Proton's own vault colours are not exposed by pass-cli.
const ROLE_STYLES: Record<string, { icon: Icon; color: Color }> = {
	owner: { icon: Icon.PersonCircle, color: Color.Yellow },
	manager: { icon: Icon.PersonCircle, color: Color.Blue },
	editor: { icon: Icon.Pencil, color: Color.Green },
	viewer: { icon: Icon.Eye, color: Color.SecondaryText },
};

export function roleStyle(role?: string): { icon: Icon; color: Color } {
	return (
		(role && ROLE_STYLES[role.toLowerCase()]) || {
			icon: Icon.Eye,
			color: Color.SecondaryText,
		}
	);
}

// Per-vault colour resolution. By default a vault is coloured by its role
// (ownership colouring); the `vaultColors` preference lets the user override
// individual vaults with "Name=color, Other=blue". A colour may be a named
// colour or any CSS colour string (e.g. #RRGGBB). Proton's own vault colours
// are not exposed by pass-cli, so this is the only way to match them.
type VaultColorPreferences = {
	vaultColors?: string;
};

// Parse the override preference once and cache it: vaultColor() is called
// twice per rendered item, so re-splitting the string on every call is waste.
let parsedColorOverrides: {
	source: string | undefined;
	map: Record<string, string>;
} = { source: undefined, map: {} };

function colorOverrides(): Record<string, string> {
	const source = getPreferenceValues<VaultColorPreferences>().vaultColors;
	if (source !== parsedColorOverrides.source) {
		parsedColorOverrides = { source, map: parseVaultColorPreference(source) };
	}
	return parsedColorOverrides.map;
}

export function vaultColor(
	role: string | undefined,
	name: string,
): Color | Color.Raw {
	const override = colorOverrides()[name.toLowerCase()];
	if (override) return override;
	return roleStyle(role).color;
}

export type ActionId =
	| "view-details"
	| "copy-username"
	| "paste-username"
	| "copy-password"
	| "paste-password"
	| "copy-totp"
	| "paste-totp"
	| "open-browser";

type OrderPreferences = {
	primaryAction?: string;
	secondaryAction?: string;
};

const KNOWN_ACTIONS: ActionId[] = [
	"view-details",
	"copy-username",
	"paste-username",
	"copy-password",
	"paste-password",
	"copy-totp",
	"paste-totp",
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
