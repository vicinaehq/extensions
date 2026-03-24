/**
 * BlueZ D-Bus client - robust wrapper for org.bluez.
 * Handles bus connection, adapter discovery, and proxy management.
 */

import * as dbus from "dbus-next";
import { wrapDbusError } from "./errors";
import {
	ADAPTER_IFACE,
	BLUEZ_SERVICE,
	DBUS_OBJECT_MANAGER,
	DBUS_PROPERTIES,
	DEVICE_IFACE,
	findAdapterPath,
	type ManagedObjects,
	macToDevicePath,
} from "./types";

let bus: dbus.MessageBus | null = null;

function getBus(): dbus.MessageBus {
	if (!bus) {
		bus = dbus.systemBus();
	}
	return bus;
}

/**
 * Get managed objects from BlueZ (all adapters, devices, etc.)
 */
export async function getManagedObjects(): Promise<ManagedObjects> {
	const b = getBus();
	try {
		const obj = await b.getProxyObject(BLUEZ_SERVICE, "/");
		const mgr = obj.getInterface(DBUS_OBJECT_MANAGER);
		// GetManagedObjects returns a{oa{sa{sv}}}
		const result = await mgr.GetManagedObjects();
		return (result as ManagedObjects) ?? {};
	} catch (err) {
		throw wrapDbusError(err);
	}
}

/**
 * Get the default adapter path (e.g. /org/bluez/hci0)
 */
export async function getAdapterPath(): Promise<string> {
	const objs = await getManagedObjects();
	const path = findAdapterPath(objs);
	if (!objs[path]?.[ADAPTER_IFACE]) {
		throw wrapDbusError(
			new Error("No Bluetooth adapter found. Is Bluetooth hardware present?"),
		);
	}
	return path;
}

/**
 * Get Properties interface for an object path
 */
export async function getPropertiesProxy(
	objectPath: string,
): Promise<dbus.ClientInterface> {
	const b = getBus();
	const obj = await b.getProxyObject(BLUEZ_SERVICE, objectPath);
	return obj.getInterface(DBUS_PROPERTIES);
}

/**
 * Unwrap a D-Bus Variant value. Handles nested Variants.
 */
export function unwrapVariant<T = unknown>(v: unknown): T {
	if (v && typeof v === "object" && "value" in v) {
		return unwrapVariant((v as { value: unknown }).value) as T;
	}
	return v as T;
}

/**
 * Get a single property value
 */
export async function getProperty<T = unknown>(
	objectPath: string,
	interfaceName: string,
	propertyName: string,
): Promise<T> {
	const props = await getPropertiesProxy(objectPath);
	try {
		const variant = await props.Get(interfaceName, propertyName);
		return unwrapVariant<T>(variant);
	} catch (err) {
		throw wrapDbusError(err);
	}
}

/**
 * Get all properties for an interface
 */
export async function getAllProperties<T extends Record<string, unknown>>(
	objectPath: string,
	interfaceName: string,
): Promise<T> {
	const props = await getPropertiesProxy(objectPath);
	try {
		const result = await props.GetAll(interfaceName);
		if (!result || typeof result !== "object") return {} as T;
		const unwrapped: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(result)) {
			unwrapped[k] = unwrapVariant(v);
		}
		return unwrapped as T;
	} catch (err) {
		throw wrapDbusError(err);
	}
}

/**
 * Set a property value
 */
export async function setProperty(
	objectPath: string,
	interfaceName: string,
	propertyName: string,
	value: unknown,
	signature: string,
): Promise<void> {
	const props = await getPropertiesProxy(objectPath);
	const variant = new dbus.Variant(signature, value);
	try {
		await props.Set(interfaceName, propertyName, variant);
	} catch (err) {
		throw wrapDbusError(err);
	}
}

/**
 * Call a method on an object (e.g. Device1.Connect)
 */
export async function callMethod(
	objectPath: string,
	interfaceName: string,
	methodName: string,
	...args: unknown[]
): Promise<unknown> {
	const b = getBus();
	const obj = await b.getProxyObject(BLUEZ_SERVICE, objectPath);
	const iface = obj.getInterface(interfaceName);
	const method = iface[methodName];
	if (typeof method !== "function") {
		throw wrapDbusError(
			new Error(`Method ${methodName} not found on ${interfaceName}`),
		);
	}
	try {
		return await method.call(iface, ...args);
	} catch (err) {
		throw wrapDbusError(err);
	}
}

/**
 * Resolve device path by MAC. Uses GetManagedObjects to find the path.
 */
export async function resolveDevicePath(mac: string): Promise<string | null> {
	const objs = await getManagedObjects();
	const adapterPath = await getAdapterPath();
	const expectedPath = macToDevicePath(mac, adapterPath);
	if (objs[expectedPath]?.[DEVICE_IFACE]) {
		return expectedPath;
	}
	// Fallback: search by Address property (handle Variant wrapping)
	const normalizedMac = mac.replace(/:/g, "_").toLowerCase();
	for (const path of Object.keys(objs)) {
		if (!path.includes("/dev_")) continue;
		const devProps = objs[path]?.[DEVICE_IFACE] as
			| Record<string, unknown>
			| undefined;
		if (!devProps?.Address) continue;
		const addrRaw = unwrapVariant<string>(devProps.Address);
		const addr = String(addrRaw ?? "")
			.replace(/:/g, "_")
			.toLowerCase();
		if (addr === normalizedMac) return path;
	}
	return null;
}
