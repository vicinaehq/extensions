import { LocalStorage } from "@vicinae/api";
import type { DeviceSummary } from "../types";
import { isPaired } from "./format";

const DEFAULT_DEVICE_KEY = "kcd.defaultDeviceId";
const LAST_DEVICE_KEY = "kcd.lastDeviceId";

export type TargetReason =
	| "explicit"
	| "default"
	| "last-used"
	| "only-connected";

export type TargetResolution =
	| { kind: "resolved"; device: DeviceSummary; reason: TargetReason }
	| { kind: "ambiguous"; devices: DeviceSummary[] }
	| { kind: "none"; reason: "no-devices" | "none-connected" };

export type ResolveOptions = {
	/** Device id from a deeplink or launch context. */
	explicitId?: string;
	/** Device name typed as a command argument; matched case-insensitively. */
	explicitName?: string;
};

export async function getDefaultDeviceId(): Promise<string | undefined> {
	return (await LocalStorage.getItem<string>(DEFAULT_DEVICE_KEY)) || undefined;
}

export async function setDefaultDeviceId(deviceId: string): Promise<void> {
	await LocalStorage.setItem(DEFAULT_DEVICE_KEY, deviceId);
}

export async function clearDefaultDeviceId(): Promise<void> {
	await LocalStorage.removeItem(DEFAULT_DEVICE_KEY);
}

export async function getLastDeviceId(): Promise<string | undefined> {
	return (await LocalStorage.getItem<string>(LAST_DEVICE_KEY)) || undefined;
}

/** Called after every successful action so the ladder learns what you use. */
export async function rememberDevice(deviceId: string): Promise<void> {
	await LocalStorage.setItem(LAST_DEVICE_KEY, deviceId);
}

/**
 * Decides which device an action should target.
 *
 * The ladder exists so that owning a second device does not mean answering a
 * prompt on every single action: an explicit choice wins, then your pinned
 * default, then whatever you used last, then the only candidate. A picker is
 * a last resort, not a default.
 *
 * Never throws and never renders UI — the caller decides how to present the
 * outcome, which is what lets no-view commands handle ambiguity differently
 * from view commands.
 */
export async function resolveTarget(
	devices: DeviceSummary[],
	options: ResolveOptions = {},
): Promise<TargetResolution> {
	const paired = devices.filter(isPaired);
	if (paired.length === 0) return { kind: "none", reason: "no-devices" };

	// An explicit choice is honoured even when the device is offline, so the
	// failure says "that device is offline" instead of silently picking another.
	if (options.explicitId) {
		const match = paired.find((d) => d.id === options.explicitId);
		if (match) return { kind: "resolved", device: match, reason: "explicit" };
	}

	if (options.explicitName) {
		const wanted = options.explicitName.trim().toLowerCase();
		const match = paired.find((d) => d.name.toLowerCase() === wanted);
		if (match) return { kind: "resolved", device: match, reason: "explicit" };
	}

	const connected = paired.filter((d) => d.connected);
	if (connected.length === 0) return { kind: "none", reason: "none-connected" };

	const defaultId = await getDefaultDeviceId();
	const pinned = connected.find((d) => d.id === defaultId);
	if (pinned) return { kind: "resolved", device: pinned, reason: "default" };

	const lastId = await getLastDeviceId();
	const last = connected.find((d) => d.id === lastId);
	if (last) return { kind: "resolved", device: last, reason: "last-used" };

	if (connected.length === 1) {
		return { kind: "resolved", device: connected[0], reason: "only-connected" };
	}

	return { kind: "ambiguous", devices: connected };
}
