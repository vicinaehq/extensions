/**
 * BlueZ D-Bus types and path helpers.
 * See: https://git.kernel.org/pub/scm/bluetooth/bluez.git/tree/doc
 */

export const BLUEZ_SERVICE = "org.bluez";
export const DBUS_OBJECT_MANAGER = "org.freedesktop.DBus.ObjectManager";
export const DBUS_PROPERTIES = "org.freedesktop.DBus.Properties";
export const ADAPTER_IFACE = "org.bluez.Adapter1";
export const DEVICE_IFACE = "org.bluez.Device1";
export const BATTERY_IFACE = "org.bluez.Battery1";
export const ROOT_PATH = "/";

/**
 * Convert MAC address to BlueZ device object path.
 * E.g. "E1:4B:6C:22:56:F0" -> "/org/bluez/hci0/dev_E1_4B_6C_22_56_F0"
 */
export function macToDevicePath(
	mac: string,
	adapterPath: string = "/org/bluez/hci0",
): string {
	// BlueZ uses dev_XX_XX_XX_XX_XX_XX format (colons -> underscores)
	const normalized = mac.replace(/:/g, "_");
	return `${adapterPath}/dev_${normalized}`;
}

/**
 * Extract MAC from BlueZ device path.
 * E.g. "/org/bluez/hci0/dev_E1_4B_6C_22_56_F0" -> "E1:4B:6C:22:56:F0"
 */
export function devicePathToMac(path: string): string {
	const match = path.match(/\/dev_([0-9A-Fa-f_]+)$/);
	if (!match) return "";
	return match[1].replace(/_/g, ":");
}

/**
 * Find adapter path from managed objects.
 * Returns /org/bluez/hci0 or first available adapter.
 */
export function findAdapterPath(managedObjects: ManagedObjects): string {
	for (const path of Object.keys(managedObjects)) {
		if (managedObjects[path][ADAPTER_IFACE]) {
			return path;
		}
	}
	return "/org/bluez/hci0"; // fallback default
}

export type ManagedObjects = Record<
	string,
	Record<string, Record<string, unknown>>
>;

export type Device1Properties = {
	Address?: string;
	AddressType?: string;
	Name?: string;
	Alias?: string;
	Icon?: string;
	Class?: number;
	Connected?: boolean;
	Paired?: boolean;
	Trusted?: boolean;
	Blocked?: boolean;
	UUIDs?: string[];
	RSSI?: number;
	ServicesResolved?: boolean;
};

export type Adapter1Properties = {
	Address?: string;
	AddressType?: string;
	Name?: string;
	Alias?: string;
	Class?: number;
	Powered?: boolean;
	Discoverable?: boolean;
	DiscoverableTimeout?: number;
	Pairable?: boolean;
	PairableTimeout?: number;
	Discovering?: boolean;
	UUIDs?: string[];
};

export type Battery1Properties = {
	Percentage?: number;
};
