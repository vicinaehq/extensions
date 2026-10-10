import { getPreferenceValues, showHUD, showToast, Toast } from "@vicinae/api";
import { KasetError } from "./applescript";

type RawPreferences = {
	volumeStep?: string;
	showHud?: boolean;
};

export type Settings = {
	volumeStep: number;
	showHud: boolean;
};

export function settings(): Settings {
	const raw = (getPreferenceValues<RawPreferences>() ?? {}) as RawPreferences;
	const step = Number.parseInt(raw.volumeStep ?? "5", 10);

	return {
		volumeStep: Number.isFinite(step) && step > 0 ? step : 5,
		showHud: raw.showHud !== false,
	};
}

export function describeError(error: unknown): {
	title: string;
	message?: string;
} {
	if (error instanceof KasetError) {
		switch (error.kind) {
			case "not-installed":
				return {
					title: "Kaset is not installed",
					message: "Get it from github.com/sozercan/kaset.",
				};
			case "not-running":
				return {
					title: "Kaset is not running",
					message: "Launch Kaset and try again.",
				};
			case "not-ready":
				return {
					title: "Kaset is still starting up",
					message: "Give it a moment and try again.",
				};
			case "timeout":
				return {
					title: "Kaset did not respond",
					message: "Try restarting Kaset.",
				};
			case "not-authorized":
				return {
					title: "Not allowed to control Kaset",
					message:
						"Allow it in System Settings > Privacy & Security > Automation.",
				};
			default:
				return { title: error.message };
		}
	}

	return {
		title: "Something went wrong",
		message: error instanceof Error ? error.message : undefined,
	};
}

/** Feedback for a successful background command. Silenced by the `showHud` preference. */
export async function hud(message: string): Promise<void> {
	if (settings().showHud) await showHUD(message);
}

/** Failures are always reported, whatever the `showHud` preference says. */
export async function hudError(error: unknown): Promise<void> {
	const { title, message } = describeError(error);
	await showHUD(message ? `${title} - ${message}` : title);
}

/** Failures inside a view, where a toast keeps the view on screen. */
export async function toastError(error: unknown): Promise<void> {
	const { title, message } = describeError(error);
	await showToast({ style: Toast.Style.Failure, title, message });
}
