/**
 * BlueZ discovery - list devices, scan for new devices, InterfacesAdded signals.
 */

import { getAdapterPath, getManagedObjects, unwrapVariant } from "./client";
import { DEVICE_IFACE, devicePathToMac } from "./types";

export type DiscoveredDevice = {
	mac: string;
	name: string;
	path: string;
	connected?: boolean;
	paired?: boolean;
};

/**
 * List all devices from GetManagedObjects, optionally filtered by paired status.
 * Values from GetManagedObjects can be D-Bus Variants - must unwrap for proper display.
 */
export async function listDevices(
	pairedOnly = false,
): Promise<DiscoveredDevice[]> {
	const objs = await getManagedObjects();
	const adapterPath = await getAdapterPath();
	const devices: DiscoveredDevice[] = [];

	for (const [path, interfaces] of Object.entries(objs)) {
		if (!path.startsWith(`${adapterPath}/dev_`)) continue;
		const devProps = interfaces[DEVICE_IFACE] as
			| Record<string, unknown>
			| undefined;
		if (!devProps) continue;
		if (pairedOnly && unwrapVariant<boolean>(devProps.Paired) !== true)
			continue;

		const mac = devicePathToMac(path);
		if (!mac) continue;

		const nameRaw = devProps.Name ?? devProps.Alias;
		const name = String(unwrapVariant<string>(nameRaw) ?? mac).trim() || mac;

		devices.push({
			mac,
			name,
			path,
			connected: unwrapVariant<boolean>(devProps.Connected) === true,
			paired: unwrapVariant<boolean>(devProps.Paired) === true,
		});
	}

	return devices;
}

/**
 * Subscribe to InterfacesAdded signals to detect new devices during scan.
 * Returns an unsubscribe function.
 */
export async function subscribeToNewDevices(
	callback: (device: DiscoveredDevice) => void,
): Promise<() => void> {
	const dbus = await import("dbus-next");
	const bus = dbus.systemBus();
	const obj = await bus.getProxyObject("org.bluez", "/");
	const objMgr = obj.getInterface("org.freedesktop.DBus.ObjectManager");
	const { unwrapVariant } = await import("./client");

	const handler = (
		objectPath: string,
		interfacesArg: Record<string, unknown>,
	) => {
		const ifaces = interfacesArg[DEVICE_IFACE] as
			| Record<string, unknown>
			| undefined;
		if (!ifaces) return;

		const mac = devicePathToMac(objectPath);
		if (!mac) return;

		const nameRaw = ifaces.Name ?? ifaces.Alias;
		const name = String(unwrapVariant<string>(nameRaw) ?? mac);
		const connected = unwrapVariant<boolean>(ifaces.Connected) === true;
		const paired = unwrapVariant<boolean>(ifaces.Paired) === true;

		callback({ mac, name, path: objectPath, connected, paired });
	};

	objMgr.on("InterfacesAdded", handler);

	return () => {
		objMgr.removeListener("InterfacesAdded", handler);
	};
}

/**
 * Subscribe to InterfacesRemoved to detect when devices are removed.
 */
export async function subscribeToRemovedDevices(
	callback: (path: string) => void,
): Promise<() => void> {
	const dbus = await import("dbus-next");
	const bus = dbus.systemBus();
	const obj = await bus.getProxyObject("org.bluez", "/");
	const objMgr = obj.getInterface("org.freedesktop.DBus.ObjectManager");

	const handler = (objectPath: string, _interfaces: string[]) => {
		if (objectPath.includes("/dev_")) callback(objectPath);
	};

	objMgr.on("InterfacesRemoved", handler);

	return () => {
		objMgr.removeListener("InterfacesRemoved", handler);
	};
}
