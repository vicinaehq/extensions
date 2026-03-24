/**
 * Bluetooth facade - all operations go through org.bluez via dbus-next.
 */

import { LocalStorage, showToast, Toast } from "@vicinae/api";
import {
	isPoweredOn as bluezIsPoweredOn,
	powerOff as bluezPowerOff,
	powerOn as bluezPowerOn,
	setDiscoverable as bluezSetDiscoverable,
	getAdapterInfo,
} from "@/bluez";
import {
	registerAgent,
	setOnPairingEnded,
	setOnPairingStarted,
	unregisterAgent,
} from "@/bluez/agent";
import {
	connect as bluezConnect,
	pair as bluezPair,
	removeDevice as bluezRemoveDeviceByMac,
	devicePropsToInfoString,
	getBatteryLevel,
	getDeviceProperties,
	setTrusted,
} from "@/bluez/device";
import { listDevices as bluezListDevices } from "@/bluez/discovery";
import { devicePathToMac } from "@/bluez/types";
import { humanizeBluetoothError } from "@/utils";

const LAST_CONNECTED_KEY = "bluetooth-last-connected";

export type Device = {
	mac: string;
	name: string;
	icon: string;
	connected: boolean;
	trusted: boolean;
	batteryLevel?: number;
};

export enum DeviceOptions {
	PAIRED = "Paired",
	BONDED = "Bonded",
	TRUSTED = "Trusted",
	CONNECTED = "Connected",
}

export enum PairingEventType {
	PasskeyConfirmation,
	PinCodeRequest,
	PairingSuccess,
	PairingFailure,
	NewDeviceDiscovered,
}

export type PairingEvent =
	| {
			type: PairingEventType.PasskeyConfirmation;
			device: Device;
			passkey: string;
	  }
	| { type: PairingEventType.PinCodeRequest; device: Device }
	| { type: PairingEventType.PairingSuccess; device: Device }
	| { type: PairingEventType.PairingFailure; device: Device; reason?: string }
	| { type: PairingEventType.NewDeviceDiscovered; device: Device };

/** Static-like API for compatibility with existing consumers */
export const Bluetooth = {
	async getInfo(mac: string): Promise<string> {
		try {
			const props = await getDeviceProperties(mac);
			const battery = await getBatteryLevel(mac);
			return props ? devicePropsToInfoString(props, battery) : "";
		} catch {
			return "";
		}
	},

	async getControllerInfo(): Promise<string> {
		try {
			const props = await getAdapterInfo();
			const lines: string[] = [];
			for (const [k, v] of Object.entries(props)) {
				if (v !== undefined)
					lines.push(
						`${k}: ${typeof v === "boolean" ? (v ? "yes" : "no") : v}`,
					);
			}
			return lines.join("\n");
		} catch {
			return "";
		}
	},

	async powerOn(): Promise<boolean> {
		try {
			await bluezPowerOn();
			return true;
		} catch {
			return false;
		}
	},

	async powerOff(): Promise<boolean> {
		try {
			await bluezPowerOff();
			return true;
		} catch {
			return false;
		}
	},

	async isPoweredOn(): Promise<boolean> {
		try {
			return await bluezIsPoweredOn();
		} catch {
			return false;
		}
	},

	saveLastConnected(device: Device): void {
		void LocalStorage.setItem(
			LAST_CONNECTED_KEY,
			JSON.stringify({ mac: device.mac, name: device.name }),
		);
	},

	async getLastConnected(): Promise<{ mac: string; name: string } | null> {
		try {
			const stored = await LocalStorage.getItem<string>(LAST_CONNECTED_KEY);
			if (!stored) return null;
			const parsed = JSON.parse(stored) as { mac: string; name: string };
			return parsed.mac ? parsed : null;
		} catch {
			return null;
		}
	},

	async listDevices(
		devicesOpts?: DeviceOptions,
	): Promise<{ mac: string; name: string }[]> {
		try {
			const pairedOnly = devicesOpts === DeviceOptions.PAIRED;
			const devices = await bluezListDevices(pairedOnly);
			return devices.map((d) => ({ mac: d.mac, name: d.name }));
		} catch {
			return [];
		}
	},
};

export async function pairToDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Pairing to ${device.name}...`,
	});

	try {
		await registerAgent();
		await bluezPair(device.mac);
		await showToast({
			style: Toast.Style.Success,
			title: "Device Paired Successfully",
			message: `Successfully paired with ${device.name}`,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await showToast({
			style: Toast.Style.Failure,
			title: "Pairing Failed",
			message: humanizeBluetoothError(msg),
		});
		throw err;
	}
}

export async function connectToDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Connecting to ${device.name}`,
	});

	try {
		await bluezConnect(device.mac);
		Bluetooth.saveLastConnected(device);
		await showToast({
			style: Toast.Style.Success,
			title: "Connected",
			message: `Connected to ${device.name}`,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await showToast({
			style: Toast.Style.Failure,
			title: "Connection Failed",
			message: humanizeBluetoothError(msg),
		});
		throw err;
	}
}

export async function disconnectFromDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Disconnecting from ${device.name}`,
	});

	try {
		const { disconnect } = await import("@/bluez/device");
		await disconnect(device.mac);
		await showToast({
			style: Toast.Style.Success,
			title: "Disconnected",
			message: `Disconnected from ${device.name}`,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await showToast({
			style: Toast.Style.Failure,
			title: "Disconnection Failed",
			message: humanizeBluetoothError(msg),
		});
		throw err;
	}
}

export async function removeDevice(device: Device): Promise<Device> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Removing ${device.name}`,
	});

	try {
		await bluezRemoveDeviceByMac(device.mac);
		await showToast({
			style: Toast.Style.Success,
			title: "Removed",
			message: `${device.name} removed successfully`,
		});
		return device;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await showToast({
			style: Toast.Style.Failure,
			title: "Removal Failed",
			message: humanizeBluetoothError(msg),
		});
		throw err;
	}
}

export async function trustDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Trusting ${device.name}`,
	});

	try {
		await setTrusted(device.mac, true);
		await showToast({
			style: Toast.Style.Success,
			title: "Trusted",
			message: `${device.name} trusted successfully`,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await showToast({
			style: Toast.Style.Failure,
			title: "Trust Failed",
			message: humanizeBluetoothError(msg),
		});
		throw err;
	}
}

export type MakeDiscoverableOptions = {
	onPairingDevice?: (device: Device | null) => void;
};

export async function makeDiscoverable(
	options: MakeDiscoverableOptions = {},
): Promise<() => void> {
	const { onPairingDevice } = options;

	setOnPairingStarted(
		onPairingDevice
			? async (devicePath) => {
					const mac = devicePathToMac(devicePath);
					const props = await getDeviceProperties(mac);
					const name =
						(props?.Name as string) ?? (props?.Alias as string) ?? mac;
					onPairingDevice({
						mac,
						name,
						icon: "",
						connected: false,
						trusted: false,
					});
				}
			: null,
	);
	setOnPairingEnded(onPairingDevice ? () => onPairingDevice(null) : null);

	try {
		await registerAgent();
		await bluezSetDiscoverable(true);
		await showToast({
			style: Toast.Style.Success,
			title: "Device is now discoverable",
			message: "Other devices can now find and pair with this device",
		});
	} catch (err) {
		setOnPairingStarted(null);
		setOnPairingEnded(null);
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(
			humanizeBluetoothError(msg ?? "Failed to become discoverable"),
		);
	}

	return async () => {
		try {
			await bluezSetDiscoverable(false);
			await unregisterAgent();
		} catch (e) {
			console.error("Discoverable cleanup:", e);
		}
		setOnPairingStarted(null);
		setOnPairingEnded(null);
	};
}

export async function makeUndiscoverable(): Promise<void> {
	try {
		await bluezSetDiscoverable(false);
		await showToast({
			style: Toast.Style.Success,
			title: "Undiscoverable",
			message: "Device is no longer discoverable",
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await showToast({
			style: Toast.Style.Failure,
			title: "Undiscoverable Failed",
			message: humanizeBluetoothError(msg),
		});
		throw err;
	}
}
