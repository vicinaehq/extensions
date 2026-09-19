import { Color, Icon } from "@vicinae/api";
import type { DeviceSummary, MediaState, SignalStrength } from "../types";

/** Cached media older than this is treated as a ghost of a finished session. */
export const MEDIA_FRESH_MS = 60_000;

export function deviceIcon(device: DeviceSummary): Icon {
	switch (device.type) {
		case "phone":
			return Icon.Mobile;
		case "tablet":
			return Icon.Mobile;
		case "laptop":
			return Icon.Desktop;
		case "desktop":
			return Icon.Desktop;
		case "tv":
			return Icon.Monitor;
		default:
			return Icon.Devices;
	}
}

export function isPaired(device: DeviceSummary): boolean {
	return device.state === "PAIRED";
}

export function batteryIcon(charge: number, charging: boolean): Icon {
	if (charging) return Icon.BatteryCharging;
	return charge <= 15 ? Icon.BatteryDisabled : Icon.Battery;
}

export function batteryColor(charge: number, charging: boolean): Color {
	if (charging) return Color.Green;
	if (charge <= 15) return Color.Red;
	if (charge <= 30) return Color.Orange;
	return Color.SecondaryText;
}

export function formatBattery(device: DeviceSummary): string | undefined {
	if (!device.battery) return undefined;
	const { charge, charging } = device.battery;
	return charging ? `${charge}% charging` : `${charge}%`;
}

/** Picks the strongest SIM; dual-SIM phones report one entry per subscription. */
export function primarySignal(
	device: DeviceSummary,
): SignalStrength | undefined {
	const strengths = device.signal?.signalStrengths;
	if (!strengths) return undefined;
	const all = Object.values(strengths);
	if (all.length === 0) return undefined;
	return all.reduce((best, s) =>
		s.signalStrength > best.signalStrength ? s : best,
	);
}

export function signalIcon(strength: number): Icon {
	if (strength >= 4) return Icon.FullSignal;
	if (strength >= 3) return Icon.Signal3;
	if (strength >= 2) return Icon.Signal2;
	if (strength >= 1) return Icon.Signal1;
	return Icon.Signal0;
}

export function formatSignal(signal: SignalStrength): string {
	const kind = signal.networkDetailedType?.trim() || signal.networkType;
	return `${kind} ${signal.signalStrength}/4`;
}

export function isMediaFresh(
	media: MediaState | undefined,
): media is MediaState {
	return media !== undefined && media.mediaAgeMs < MEDIA_FRESH_MS;
}

export function formatTrack(media: MediaState): string {
	const artist = media.artist?.trim();
	const title = media.title?.trim() || "Unknown track";
	return artist ? `${title} — ${artist}` : title;
}

/** A year: ages beyond this are not real readings, they are unset timestamps. */
const MAX_SANE_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Humanises an age in milliseconds.
 *
 * The daemon derives ages with `time.Since(...)`, so a field whose timestamp
 * was never set arrives as the milliseconds since Go's zero time — a number
 * far outside any date JavaScript can represent. Clamping here keeps that out
 * of every caller.
 */
export function formatAgeMs(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0 || ms > MAX_SANE_AGE_MS) return "unknown";

	const seconds = Math.round(ms / 1000);
	if (seconds < 45) return "just now";

	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	return `${Math.round(hours / 24)}d ago`;
}

export function formatRelativeTime(iso: string): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return "unknown";
	return formatAgeMs(Date.now() - then);
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "0:00";
	const total = Math.round(ms / 1000);
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/** The one-line status shown under a device name. */
export function deviceStatusText(device: DeviceSummary): string {
	if (!isPaired(device)) {
		return device.state === "PAIR_REQUESTED_BY_PEER"
			? "Wants to pair with this computer"
			: "Not paired";
	}
	if (device.connected) {
		const battery = formatBattery(device);
		return battery ? `Connected · ${battery}` : "Connected";
	}
	return `Offline · last seen ${formatRelativeTime(device.last_seen)}`;
}

const TYPE_RANK: Record<string, number> = {
	phone: 0,
	tablet: 1,
	laptop: 2,
	desktop: 3,
	tv: 4,
};

/**
 * Connected devices first, then by kind, then most recently seen. The pinned
 * default floats to the very top so the device you actually use leads the list.
 */
export function sortDevices(
	devices: DeviceSummary[],
	defaultDeviceId?: string,
): DeviceSummary[] {
	return [...devices].sort((a, b) => {
		if (a.connected !== b.connected) return a.connected ? -1 : 1;
		if (defaultDeviceId) {
			if (a.id === defaultDeviceId) return -1;
			if (b.id === defaultDeviceId) return 1;
		}
		const rank = (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9);
		if (rank !== 0) return rank;
		return Date.parse(b.last_seen) - Date.parse(a.last_seen);
	});
}
