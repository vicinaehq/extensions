/**
 * BlueZ Device operations - connect, disconnect, trust, remove, get info.
 */

import {
	callMethod,
	getAllProperties,
	resolveDevicePath,
	setProperty,
} from "./client";
import type { Battery1Properties, Device1Properties } from "./types";

/**
 * Convert Device1Properties to info-string format for compatibility with getIconFromInfo, etc.
 */
export function devicePropsToInfoString(
	props: Device1Properties,
	battery?: number,
): string {
	const lines: string[] = [];
	if (props.Name) lines.push(`Name: ${props.Name}`);
	if (props.Alias) lines.push(`Alias: ${props.Alias}`);
	if (props.Address) lines.push(`Address: ${props.Address}`);
	if (props.Connected !== undefined)
		lines.push(`Connected: ${props.Connected ? "yes" : "no"}`);
	if (props.Paired !== undefined)
		lines.push(`Paired: ${props.Paired ? "yes" : "no"}`);
	if (props.Trusted !== undefined)
		lines.push(`Trusted: ${props.Trusted ? "yes" : "no"}`);
	if (props.Icon) lines.push(`Icon: ${props.Icon}`);
	if (battery !== undefined)
		lines.push(
			`Battery Percentage: 0x${battery.toString(16).padStart(2, "0")} (${battery})`,
		);
	return lines.join("\n");
}

import { wrapDbusError } from "./errors";

export async function getDeviceProperties(
	mac: string,
): Promise<Device1Properties | null> {
	const path = await resolveDevicePath(mac);
	if (!path) return null;
	try {
		return getAllProperties<Device1Properties>(path, "org.bluez.Device1");
	} catch {
		return null;
	}
}

export async function getBatteryLevel(
	mac: string,
): Promise<number | undefined> {
	const path = await resolveDevicePath(mac);
	if (!path) return undefined;
	try {
		const props = await getAllProperties<Battery1Properties>(
			path,
			"org.bluez.Battery1",
		);
		return props?.Percentage;
	} catch {
		return undefined;
	}
}

export async function connect(mac: string): Promise<void> {
	const path = await resolveDevicePath(mac);
	if (!path) {
		throw wrapDbusError(
			new Error(
				`Device ${mac} not found. Pair it first or ensure it's in range.`,
			),
		);
	}
	try {
		await callMethod(path, "org.bluez.Device1", "Connect");
	} catch (err) {
		throw wrapDbusError(err);
	}
}

export async function disconnect(mac: string): Promise<void> {
	const path = await resolveDevicePath(mac);
	if (!path) {
		throw wrapDbusError(new Error(`Device ${mac} not found.`));
	}
	try {
		await callMethod(path, "org.bluez.Device1", "Disconnect");
	} catch (err) {
		throw wrapDbusError(err);
	}
}

export async function setTrusted(mac: string, trusted: boolean): Promise<void> {
	const path = await resolveDevicePath(mac);
	if (!path) {
		throw wrapDbusError(new Error(`Device ${mac} not found.`));
	}
	await setProperty(path, "org.bluez.Device1", "Trusted", trusted, "b");
}

export async function removeDevice(mac: string): Promise<void> {
	const { removeDeviceByPath } = await import("./adapter");
	const path = await resolveDevicePath(mac);
	if (!path) {
		throw wrapDbusError(new Error(`Device ${mac} not found.`));
	}
	await removeDeviceByPath(path);
}

export async function isConnected(mac: string): Promise<boolean> {
	const props = await getDeviceProperties(mac);
	return props?.Connected === true;
}

export async function pair(mac: string): Promise<void> {
	const path = await resolveDevicePath(mac);
	if (!path) {
		throw wrapDbusError(
			new Error(
				`Device ${mac} not found. Ensure it's in pairing mode and in range.`,
			),
		);
	}
	try {
		await callMethod(path, "org.bluez.Device1", "Pair");
	} catch (err) {
		throw wrapDbusError(err);
	}
}
