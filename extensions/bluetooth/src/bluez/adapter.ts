/**
 * BlueZ Adapter operations - power, discoverable, discovery.
 */

import {
	callMethod,
	getAdapterPath,
	getAllProperties,
	getProperty,
	setProperty,
} from "./client";
import { wrapDbusError } from "./errors";
import type { Adapter1Properties } from "./types";

export async function isPoweredOn(): Promise<boolean> {
	const path = await getAdapterPath();
	const powered = await getProperty<boolean>(
		path,
		"org.bluez.Adapter1",
		"Powered",
	);
	return powered === true;
}

export async function powerOn(): Promise<void> {
	const path = await getAdapterPath();
	await setProperty(path, "org.bluez.Adapter1", "Powered", true, "b");
}

export async function powerOff(): Promise<void> {
	const path = await getAdapterPath();
	await setProperty(path, "org.bluez.Adapter1", "Powered", false, "b");
}

export async function getAdapterInfo(): Promise<Adapter1Properties> {
	const path = await getAdapterPath();
	return getAllProperties<Adapter1Properties>(path, "org.bluez.Adapter1");
}

export async function setDiscoverable(on: boolean): Promise<void> {
	const path = await getAdapterPath();
	await setProperty(path, "org.bluez.Adapter1", "Discoverable", on, "b");
}

export async function isDiscoverable(): Promise<boolean> {
	const path = await getAdapterPath();
	const val = await getProperty<boolean>(
		path,
		"org.bluez.Adapter1",
		"Discoverable",
	);
	return val === true;
}

export async function startDiscovery(): Promise<void> {
	const path = await getAdapterPath();
	try {
		await callMethod(path, "org.bluez.Adapter1", "StartDiscovery");
	} catch (err) {
		// InProgress is not fatal - discovery may already be running
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("In Progress") || msg.includes("InProgress")) {
			return;
		}
		throw wrapDbusError(err);
	}
}

export async function stopDiscovery(): Promise<void> {
	const path = await getAdapterPath();
	try {
		await callMethod(path, "org.bluez.Adapter1", "StopDiscovery");
	} catch (err) {
		throw wrapDbusError(err);
	}
}

export async function removeDeviceByPath(devicePath: string): Promise<void> {
	const adapterPath = await getAdapterPath();
	try {
		await callMethod(
			adapterPath,
			"org.bluez.Adapter1",
			"RemoveDevice",
			devicePath,
		);
	} catch (err) {
		throw wrapDbusError(err);
	}
}
