import {
	Alert,
	confirmAlert,
	Toast,
	showToast,
} from "@vicinae/api";
import { ChildProcess, spawn, exec } from "child_process";
import { stripAnsiCodes, } from "@/utils";
import * as util from "util";
import { BLUETOOTH_REGEX } from "@/patterns";

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
};

// Pairing event types
export enum PairingEventType {
	PasskeyConfirmation,
	PinCodeRequest,
	PairingSuccess,
	PairingFailure,
	NewDeviceDiscovered,
}

export type PairingEvent =
	| { type: PairingEventType.PasskeyConfirmation; device: Device; passkey: string }
	| { type: PairingEventType.PinCodeRequest; device: Device }
	| { type: PairingEventType.PairingSuccess; device: Device }
	| { type: PairingEventType.PairingFailure; device: Device; reason?: string }
	| { type: PairingEventType.NewDeviceDiscovered; device: Device };

const execAsync = util.promisify(exec);

// Enhanced types for centralized parsing
export enum BluetoothctlLineType {
	// Device discovery and listing
	DeviceListed = "DeviceListed",
	DeviceNew = "DeviceNew",
	DeviceChanged = "DeviceChanged",
	DeviceDeleted = "DeviceDeleted",

	// Pairing events
	PasskeyConfirmation = "PasskeyConfirmation",
	PinCodeRequest = "PinCodeRequest",
	PairingSuccess = "PairingSuccess",
	PairingFailure = "PairingFailure",

	// Connection events
	ConnectionSuccess = "ConnectionSuccess",
	ConnectionFailure = "ConnectionFailure",
	DeviceConnected = "DeviceConnected",
	DeviceDisconnected = "DeviceDisconnected",

	// Disconnect events
	DisconnectSuccess = "DisconnectSuccess",
	DisconnectFailure = "DisconnectFailure",

	// Remove events
	RemoveSuccess = "RemoveSuccess",
	RemoveFailure = "RemoveFailure",

	// Trust events
	TrustSuccess = "TrustSuccess",
	TrustFailure = "TrustFailure",

	// Discoverable events
	DiscoverableSuccess = "DiscoverableSuccess",
	DiscoverableFailure = "DiscoverableFailure",
	UndiscoverableSuccess = "UndiscoverableSuccess",
	UndiscoverableFailure = "UndiscoverableFailure",

	// Generic/Unknown
	Unknown = "Unknown"
}

export type BluetoothctlLine =
	| { type: BluetoothctlLineType.DeviceListed; device: { mac: string; name: string } }
	| { type: BluetoothctlLineType.DeviceNew; device: { mac: string; name: string } }
	| { type: BluetoothctlLineType.DeviceChanged; device: { mac: string; name: string }; property?: string }
	| { type: BluetoothctlLineType.DeviceDeleted; device: { mac: string; name: string } }
	| { type: BluetoothctlLineType.PasskeyConfirmation; passkey: string; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.PinCodeRequest; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.PairingSuccess; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.PairingFailure; reason: string; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.ConnectionSuccess; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.ConnectionFailure; reason: string; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.DeviceConnected; device: { mac: string; name: string } }
	| { type: BluetoothctlLineType.DeviceDisconnected; device: { mac: string; name: string } }
	| { type: BluetoothctlLineType.DisconnectSuccess; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.DisconnectFailure; reason: string; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.RemoveSuccess; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.RemoveFailure; reason: string; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.TrustSuccess; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.TrustFailure; reason: string; device?: { mac: string; name: string } }
	| { type: BluetoothctlLineType.DiscoverableSuccess }
	| { type: BluetoothctlLineType.DiscoverableFailure; reason: string }
	| { type: BluetoothctlLineType.UndiscoverableSuccess }
	| { type: BluetoothctlLineType.UndiscoverableFailure; reason: string }
	| { type: BluetoothctlLineType.Unknown; rawLine: string };

// Centralized parsing function
export function parseBluetoothctlLine(rawLine: string): BluetoothctlLine {
	const line = stripAnsiCodes(rawLine.trim());

	if (!line) {
		return { type: BluetoothctlLineType.Unknown, rawLine };
	}

	// Device discovery patterns
	const deviceMatch = line.match(BLUETOOTH_REGEX.deviceLine);
	if (deviceMatch) {
		const mac = deviceMatch[1];
		const name = deviceMatch[2].trim();

		if (line.includes('NEW')) {
			return { type: BluetoothctlLineType.DeviceNew, device: { mac, name } };
		} else if (line.includes('CHG')) {
			// Extract what property changed if possible
			const property = line.includes('Connected:') ? 'Connected'
				: line.includes('Paired:') ? 'Paired'
					: line.includes('Trusted:') ? 'Trusted'
						: undefined;
			return { type: BluetoothctlLineType.DeviceChanged, device: { mac, name }, property };
		} else if (line.includes('DEL')) {
			return { type: BluetoothctlLineType.DeviceDeleted, device: { mac, name } };
		} else {
			return { type: BluetoothctlLineType.DeviceListed, device: { mac, name } };
		}
	}

	// Connection state changes
	if (BLUETOOTH_REGEX.DeviceConnectedYes.test(line)) {
		const mac = line.match(BLUETOOTH_REGEX.DeviceConnectedYes)?.[1] ?? "";
		return { type: BluetoothctlLineType.DeviceConnected, device: { mac, name: '' } };
	}

	if (BLUETOOTH_REGEX.DeviceConnectedNo.test(line)) {
		const mac = line.match(BLUETOOTH_REGEX.DeviceConnectedNo)?.[1] ?? "";
		return { type: BluetoothctlLineType.DeviceDisconnected, device: { mac, name: '' } };
	}

	// Pairing patterns
	if (BLUETOOTH_REGEX.passkeyConfirmation.test(line)) {
		const passkey = line.match(BLUETOOTH_REGEX.passkeyConfirmation)?.[1] ?? "";
		return { type: BluetoothctlLineType.PasskeyConfirmation, passkey };
	}

	if (BLUETOOTH_REGEX.pinCodeRequest.test(line)) {
		return { type: BluetoothctlLineType.PinCodeRequest };
	}

	if (BLUETOOTH_REGEX.pairingSuccess.test(line)) {
		return { type: BluetoothctlLineType.PairingSuccess };
	}

	if (BLUETOOTH_REGEX.pairingFailure.test(line)) {
		return { type: BluetoothctlLineType.PairingFailure, reason: line };
	}

	// Connection patterns
	if (BLUETOOTH_REGEX.connectionSuccess.test(line)) {
		return { type: BluetoothctlLineType.ConnectionSuccess };
	}

	if (BLUETOOTH_REGEX.connectionFailure.test(line)) {
		return { type: BluetoothctlLineType.ConnectionFailure, reason: line };
	}

	// Disconnect patterns
	if (BLUETOOTH_REGEX.disconnectSuccess.test(line)) {
		return { type: BluetoothctlLineType.DisconnectSuccess };
	}

	if (BLUETOOTH_REGEX.disconnectFailure.test(line)) {
		return { type: BluetoothctlLineType.DisconnectFailure, reason: line };
	}

	// Remove patterns
	if (BLUETOOTH_REGEX.removeSuccess.test(line)) {
		return { type: BluetoothctlLineType.RemoveSuccess };
	}

	if (BLUETOOTH_REGEX.removeFailure.test(line)) {
		return { type: BluetoothctlLineType.RemoveFailure, reason: line };
	}

	// Trust patterns
	if (BLUETOOTH_REGEX.trustSuccess.test(line)) {
		return { type: BluetoothctlLineType.TrustSuccess };
	}

	if (BLUETOOTH_REGEX.trustFailure.test(line)) {
		return { type: BluetoothctlLineType.TrustFailure, reason: line };
	}

	// Discoverable patterns
	if (BLUETOOTH_REGEX.discoverableSuccess?.test(line) ||
		line.includes("Changing discoverable on succeeded")) {
		return { type: BluetoothctlLineType.DiscoverableSuccess };
	}

	if (BLUETOOTH_REGEX.discoverableFailure?.test(line) ||
		line.includes("Failed to set discoverable")) {
		return { type: BluetoothctlLineType.DiscoverableFailure, reason: line };
	}

	if (BLUETOOTH_REGEX.undiscoverableSuccess?.test(line) ||
		line.includes("Changing discoverable off succeeded")) {
		return { type: BluetoothctlLineType.UndiscoverableSuccess };
	}

	if (BLUETOOTH_REGEX.undiscoverableFailure?.test(line) ||
		line.includes("Failed to set discoverable")) {
		return { type: BluetoothctlLineType.UndiscoverableFailure, reason: line };
	}

	// Default to unknown
	return { type: BluetoothctlLineType.Unknown, rawLine: line };
}

// Refactored Bluetoothctl class
export class Bluetoothctl {
	private proc: ChildProcess;
	private lineHandlers: Array<(line: BluetoothctlLine) => void> = [];

	constructor() {
		this.proc = spawn("bluetoothctl");

		this.proc.stderr?.on("data", (data) => {
			console.error("BTCTL STDERR:", data.toString());
		});

		this.proc.stdout?.on("data", (data) => {
			const output = data.toString();

			// Parse each line and call handlers
			output.split('\n').forEach((rawLine: string) => {
				if (rawLine.trim()) {
					const parsedLine = parseBluetoothctlLine(rawLine);
					this.lineHandlers.forEach(handler => handler(parsedLine));
				}
			});
		});
	}

	private send(command: string) {
		this.proc.stdin?.write(`${command}\n`);
	}

	onLine(handler: (line: BluetoothctlLine) => void) {
		this.lineHandlers.push(handler);
	}

	removeLineHandler(handler: (line: BluetoothctlLine) => void) {
		const index = this.lineHandlers.indexOf(handler);
		if (index > -1) {
			this.lineHandlers.splice(index, 1);
		}
	}

	pair(mac: string) { this.send(`pair ${mac}`); }
	connect(mac: string) { this.send(`connect ${mac}`); }
	disconnect(mac: string) { this.send(`disconnect ${mac}`); }
	remove(mac: string) { this.send(`remove ${mac}`); }
	trust(mac: string) { this.send(`trust ${mac}`); }
	scanOn() { this.send("scan on"); }
	scanOff() { this.send("scan off"); }
	discoverable(state: "on" | "off") { this.send(`discoverable ${state}`); }
	discoverableTimeout(seconds: number) { this.send(`discoverable-timeout ${seconds}`); }
	yes() { this.send("yes"); }
	no() { this.send("no"); }
	pin(pin: string) { this.send(`${pin}`); }
	devices(devicesOpts?: DeviceOptions) { this.send(`devices ${devicesOpts || ""}`); }
	kill() { this.proc.kill(); }

	static async getInfo(mac: string): Promise<string> {
		try {
			const { stdout } = await execAsync(`bluetoothctl info ${mac}`);
			return stdout;
		} catch (error) {
			console.error("Error running bluetoothctl info:", error);
			return "";
		}
	}

	static async getControllerInfo(): Promise<string> {
		try {
			const { stdout } = await execAsync(`bluetoothctl show`);
			return stdout;
		} catch (error) {
			console.error("Error running bluetoothctl show:", error);
			return "";
		}
	}

	static async listDevices(devicesOpts?: DeviceOptions): Promise<{ mac: string; name: string }[]> {
		try {
			const { stdout } = await execAsync("bluetoothctl devices " + (devicesOpts ? devicesOpts : ""));
			const lines = stdout.trim().split("\n");
			return lines
				.map((line) => {
					const match = line.match(BLUETOOTH_REGEX.deviceLine);
					if (match) {
						return { mac: match[1], name: match[2].trim() };
					}
					return null;
				})
				.filter(Boolean) as { mac: string; name: string }[];
		} catch (error) {
			console.error("Error running bluetoothctl devices:", error);
			return [];
		}
	}
}

export async function pairToDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Pairing to ${device.name}...`,
	});

	return new Promise<void>((resolve, reject) => {
		const bt = new Bluetoothctl();
		const timeout = setTimeout(() => {
			bt.kill();
			reject(console.error("Pairing timed out"));
		}, 20000);

		// Set up line handler for pairing events
		const handlePairingLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case BluetoothctlLineType.PasskeyConfirmation: {
					const confirm = await confirmAlert({
						title: `Pairing Confirmation Required`,
						message: `${device.name} is requesting to pair.\n\nDoes the passkey match on both devices?\n\nPasskey: ${line.passkey}`,
						primaryAction: { title: "Accept", style: Alert.ActionStyle.Default },
						dismissAction: { title: "Decline" },
					});

					if (confirm) {
						bt.yes();
						await showToast({
							style: Toast.Style.Animated,
							title: "Pairing Accepted",
							message: `Accepting pairing with ${device.name}...`,
						});
					} else {
						bt.no();
						clearTimeout(timeout);
						bt.kill();
						await showToast({
							style: Toast.Style.Failure,
							title: "Pairing Declined",
							message: "You declined the pairing confirmation.",
						});
						reject(console.error("User rejected pairing"));
					}
					break;
				}

				case BluetoothctlLineType.PinCodeRequest: {
					const pin = prompt(`Enter PIN Code for ${device.name}\n\n(This may be initiated by the device you're trying to pair with)`);
					if (pin) {
						bt.pin(pin);
						await showToast({
							style: Toast.Style.Animated,
							title: "PIN Entered",
							message: `Processing pairing with ${device.name}...`,
						});
					} else {
						clearTimeout(timeout);
						bt.kill();
						await showToast({
							style: Toast.Style.Failure,
							title: "Pairing Cancelled",
							message: "PIN entry was cancelled.",
						});
						reject(console.error("PIN entry cancelled"));
					}
					break;
				}

				case BluetoothctlLineType.PairingSuccess: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Success,
						title: "Device Paired Successfully",
						message: `Successfully paired with ${device.name}`,
					});
					resolve();
					break;
				}

				case BluetoothctlLineType.PairingFailure: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Failure,
						title: "Pairing Failed",
						message: line.reason ?? "Unknown error",
					});
					reject(console.error(line.reason));
					break;
				}
			}
		};

		bt.onLine(handlePairingLine);
		bt.pair(device.mac);
	});
}

export async function connectToDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Connecting to ${device.name}`,
	});

	return new Promise<void>((resolve, reject) => {
		const bt = new Bluetoothctl();
		const timeout = setTimeout(() => {
			bt.kill();
			reject(console.error("Connection timed out"));
		}, 10000);

		const handleConnectionLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case BluetoothctlLineType.ConnectionSuccess: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Success,
						title: "Connected",
						message: `Connected to ${device.name}`,
					});
					resolve();
					break;
				}

				case BluetoothctlLineType.ConnectionFailure: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Failure,
						title: "Connection Failed",
						message: line.reason,
					});
					reject(console.error(line.reason));
					break;
				}
			}
		};

		bt.onLine(handleConnectionLine);
		bt.connect(device.mac);
	});
}


export async function disconnectFromDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Disconnecting from ${device.name}`,
	});

	return new Promise<void>((resolve, reject) => {
		const bt = new Bluetoothctl();
		const timeout = setTimeout(() => {
			bt.kill();
			reject(console.error("Disconnection timed out"));
		}, 10000);

		const handleDisconnectLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case BluetoothctlLineType.DisconnectSuccess: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Success,
						title: "Disconnected",
						message: `Disconnected from ${device.name}`,
					});
					resolve();
					break;
				}

				case BluetoothctlLineType.DisconnectFailure: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Failure,
						title: "Disconnection Failed",
						message: line.reason,
					});
					reject(console.error(line.reason));
					break;
				}
			}
		};

		bt.onLine(handleDisconnectLine);
		bt.disconnect(device.mac);
	});
}

export async function removeDevice(device: Device): Promise<Device> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Removing ${device.name}`,
	});

	return new Promise<Device>((resolve, reject) => {
		const bt = new Bluetoothctl();
		const timeout = setTimeout(() => {
			bt.kill();
			reject(console.error("Removal timed out"));
		}, 10000);

		const handleRemoveLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case BluetoothctlLineType.RemoveSuccess: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Success,
						title: "Removed",
						message: `${device.name} removed successfully`,
					});
					resolve(device);
					break;
				}

				case BluetoothctlLineType.RemoveFailure: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Failure,
						title: "Removal Failed",
						message: line.reason,
					});
					reject(console.error(line.reason));
					break;
				}
			}
		};

		bt.onLine(handleRemoveLine);
		bt.remove(device.mac);
	});
}

export async function trustDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Trusting ${device.name}`,
	});

	return new Promise<void>((resolve, reject) => {
		const bt = new Bluetoothctl();
		const timeout = setTimeout(() => {
			bt.kill();
			reject(console.error("Trust timed out"));
		}, 10000);

		const handleTrustLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case BluetoothctlLineType.TrustSuccess: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Success,
						title: "Trusted",
						message: `${device.name} trusted successfully`,
					});
					resolve();
					break;
				}

				case BluetoothctlLineType.TrustFailure: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Failure,
						title: "Trust Failed",
						message: line.reason,
					});
					reject(console.error(line.reason));
					break;
				}
			}
		};

		bt.onLine(handleTrustLine);
		bt.trust(device.mac);
	});
}

export async function makeDiscoverable(): Promise<() => void> {
	return new Promise<() => void>((resolve, reject) => {
		const bt = new Bluetoothctl();
		let isDiscoverable = false;
		let currentPairingDevice: Device | null = null;

		const handleDiscoverableLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case BluetoothctlLineType.DiscoverableSuccess: {
					isDiscoverable = true;
					await showToast({
						style: Toast.Style.Success,
						title: "Device is now discoverable",
						message: "Other devices can now find and pair with this device",
					});

					// Return cleanup function
					resolve(async () => {
						try {
							await makeUndiscoverable();
						} catch (err) {
							console.error("Failed to disable discoverable mode on cleanup:", err);
						}
						bt.kill();
					});
					break;
				}

				case BluetoothctlLineType.DiscoverableFailure: {
					bt.kill();
					reject(console.error(`Failed to become discoverable: ${line.reason}`));
					break;
				}

				case BluetoothctlLineType.DeviceNew: {
					if (isDiscoverable) {
						currentPairingDevice = {
							mac: line.device.mac,
							name: line.device.name,
							icon: "",
							connected: false,
							trusted: false,
						};

						await showToast({
							style: Toast.Style.Success,
							title: "New Device Found",
							message: `${line.device.name} is attempting to connect`,
						});
					}
					break;
				}

				case BluetoothctlLineType.PasskeyConfirmation:
				case BluetoothctlLineType.PinCodeRequest: {
					if (isDiscoverable && currentPairingDevice) {
						// Handle incoming pairing events similar to outgoing
						await handleIncomingPairingEvent(line, bt, currentPairingDevice);
					}
					break;
				}

				case BluetoothctlLineType.PairingSuccess:
				case BluetoothctlLineType.PairingFailure: {
					if (currentPairingDevice) {
						await handleIncomingPairingEvent(line, bt, currentPairingDevice);
						currentPairingDevice = null; // Reset after completion
					}
					break;
				}
			}
		};

		bt.onLine(handleDiscoverableLine);
		bt.discoverable("on");
	});
}

export async function makeUndiscoverable(): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const bt = new Bluetoothctl();

		const timeout = setTimeout(() => {
			bt.kill();
			reject(console.error("Undiscoverable timed out"));
		}, 10000);

		const handleUndiscoverableLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case BluetoothctlLineType.UndiscoverableSuccess: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Success,
						title: "Undiscoverable",
						message: "Device is no longer discoverable",
					});
					resolve();
					break;
				}

				case BluetoothctlLineType.UndiscoverableFailure: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Failure,
						title: "Undiscoverable Failed",
						message: line.reason,
					});
					reject(console.error(line.reason));
					break;
				}
			}
		};

		bt.onLine(handleUndiscoverableLine);
		bt.discoverable("off");
	});
}

// Helper function for incoming pairing events
async function handleIncomingPairingEvent(
	line: BluetoothctlLine,
	bt: Bluetoothctl,
	device: Device
) {
	switch (line.type) {
		case BluetoothctlLineType.PasskeyConfirmation: {
			const confirm = await confirmAlert({
				title: `Incoming Pairing Request`,
				message: `${device.name} wants to pair with this device.\n\nDoes the passkey match on your device?\n\nPasskey: ${line.passkey}`,
				primaryAction: { title: "Accept", style: Alert.ActionStyle.Default },
				dismissAction: { title: "Decline" },
			});

			if (confirm) {
				bt.yes();
				await showToast({
					style: Toast.Style.Animated,
					title: "Pairing Accepted",
					message: `Accepting pairing request from ${device.name}...`,
				});
			} else {
				bt.no();
				await showToast({
					style: Toast.Style.Failure,
					title: "Pairing Declined",
					message: `Declined pairing request from ${device.name}`,
				});
			}
			break;
		}

		case BluetoothctlLineType.PinCodeRequest: {
			const pin = prompt(`Enter PIN Code for incoming pairing request from ${device.name}`);
			if (pin) {
				bt.pin(pin);
				await showToast({
					style: Toast.Style.Animated,
					title: "PIN Entered",
					message: `Processing pairing request from ${device.name}...`,
				});
			} else {
				await showToast({
					style: Toast.Style.Failure,
					title: "Pairing Cancelled",
					message: `PIN entry cancelled for ${device.name}`,
				});
			}
			break;
		}

		case BluetoothctlLineType.PairingSuccess: {
			await showToast({
				style: Toast.Style.Success,
				title: "Device Paired Successfully",
				message: `Successfully paired with ${device.name}`,
			});
			break;
		}

		case BluetoothctlLineType.PairingFailure: {
			await showToast({
				style: Toast.Style.Failure,
				title: "Pairing Failed",
				message: `Failed to pair with ${device.name}: ${line.reason ?? "Unknown error"}`,
			});
			break;
		}
	}
}
