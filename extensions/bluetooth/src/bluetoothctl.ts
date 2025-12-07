import {
	Alert,
	confirmAlert,
	Toast,
	showToast,
	Icon,
} from "@vicinae/api";
import { ChildProcess, spawn, exec } from "child_process";
import { stripAnsiCodes, } from "@/utils";
import * as util from "util";
import { BLUETOOTH_REGEX } from "@/patterns";
import { getIconFromInfo } from "@/utils";

const execAsync = util.promisify(exec);

export type BluetoothState = {
	name: string;
	powered: boolean;
	discoverable: boolean;
	discovering: boolean;
	pairable: boolean;
}

export class Device {
	mac: string;
	name: string;
	icon: string;
	connected: boolean;
	trusted: boolean;

	constructor(mac: string, name: string, icon: string, connected: boolean, trusted: boolean) {
		this.mac = mac;
		this.name = name;
		this.icon = icon;
		this.connected = connected;
		this.trusted = trusted;
	}
}

export enum DeviceOptions {
	PAIRED = "Paired",
	BONDED = "Bonded",
	TRUSTED = "Trusted",
	CONNECTED = "Connected",
};

// Types for centralized parsing
export enum LineType {
	// Device discovery and listing
	DeviceListed = "DeviceListed",
	DeviceNew = "DeviceNew",
	DeviceChanged = "DeviceChanged",
	DeviceDeleted = "DeviceDeleted",

	// Pairing events
	PasskeyConfirmation = "PasskeyConfirmation",
	RequestCancelled = "RequestCancelled",
	AuthorizeService = "AuthorizeService",
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
	| { type: LineType.DeviceListed; device: { mac: string; name: string } }
	| { type: LineType.DeviceNew; device: { mac: string; name: string } }
	| { type: LineType.DeviceChanged; device: { mac: string; name: string }; property?: string }
	| { type: LineType.DeviceDeleted; device: { mac: string; name: string } }
	| { type: LineType.PasskeyConfirmation; passkey: string; device?: { mac: string; name: string } }
	| { type: LineType.RequestCancelled; }
	| { type: LineType.AuthorizeService; uuid: string; }
	| { type: LineType.PinCodeRequest; device?: { mac: string; name: string } }
	| { type: LineType.PairingSuccess; device?: { mac: string; name: string } }
	| { type: LineType.PairingFailure; reason: string; device?: { mac: string; name: string } }
	| { type: LineType.ConnectionSuccess; device?: { mac: string; name: string } }
	| { type: LineType.ConnectionFailure; reason: string; device?: { mac: string; name: string } }
	| { type: LineType.DeviceConnected; device: { mac: string; name: string } }
	| { type: LineType.DeviceDisconnected; device: { mac: string; name: string } }
	| { type: LineType.DisconnectSuccess; device?: { mac: string; name: string } }
	| { type: LineType.DisconnectFailure; reason: string; device?: { mac: string; name: string } }
	| { type: LineType.RemoveSuccess; device?: { mac: string; name: string } }
	| { type: LineType.RemoveFailure; reason: string; device?: { mac: string; name: string } }
	| { type: LineType.TrustSuccess; device?: { mac: string; name: string } }
	| { type: LineType.TrustFailure; reason: string; device?: { mac: string; name: string } }
	| { type: LineType.DiscoverableSuccess }
	| { type: LineType.DiscoverableFailure; reason: string }
	| { type: LineType.UndiscoverableSuccess }
	| { type: LineType.UndiscoverableFailure; reason: string }
	| { type: LineType.Unknown; rawLine: string };

// Enum for pairing context to customize messaging
export enum PairingContext {
	OutgoingPairing = "OutgoingPairing",
	IncomingPairing = "IncomingPairing"
}

// Centralized parsing function
export function parseBluetoothctlLine(rawLine: string): BluetoothctlLine {
	const line = stripAnsiCodes(rawLine.trim());

	if (!line) {
		return { type: LineType.Unknown, rawLine };
	}

	// Device discovery patterns
	const deviceMatch = line.match(BLUETOOTH_REGEX.deviceLine);
	if (deviceMatch) {
		const mac = deviceMatch[1];
		const name = deviceMatch[2].trim();

		if (line.includes('NEW')) {
			return { type: LineType.DeviceNew, device: { mac, name } };
		} else if (line.includes('CHG')) {
			// Extract what property changed if possible
			const property = line.includes('Connected:') ? 'Connected'
				: line.includes('Paired:') ? 'Paired'
					: line.includes('Trusted:') ? 'Trusted'
						: undefined;
			return { type: LineType.DeviceChanged, device: { mac, name }, property };
		} else if (line.includes('DEL')) {
			return { type: LineType.DeviceDeleted, device: { mac, name } };
		} else {
			return { type: LineType.DeviceListed, device: { mac, name } };
		}
	}

	// Connection state changes
	if (BLUETOOTH_REGEX.DeviceConnectedYes.test(line)) {
		const mac = line.match(BLUETOOTH_REGEX.DeviceConnectedYes)?.[1] ?? "";
		return { type: LineType.DeviceConnected, device: { mac, name: '' } };
	}

	if (BLUETOOTH_REGEX.DeviceConnectedNo.test(line)) {
		const mac = line.match(BLUETOOTH_REGEX.DeviceConnectedNo)?.[1] ?? "";
		return { type: LineType.DeviceDisconnected, device: { mac, name: '' } };
	}

	// Pairing patterns
	if (BLUETOOTH_REGEX.passkeyConfirmation.test(line)) {
		const passkey = line.match(BLUETOOTH_REGEX.passkeyConfirmation)?.[1] ?? "";
		return { type: LineType.PasskeyConfirmation, passkey };
	}

	if (BLUETOOTH_REGEX.requestCancelled.test(line)) {
		return { type: LineType.RequestCancelled };
	}

	if (BLUETOOTH_REGEX.authorizeService.test(line)) {
		const uuid = line.match(BLUETOOTH_REGEX.authorizeService)?.[1] ?? "";
		return { type: LineType.AuthorizeService, uuid };
	}

	if (BLUETOOTH_REGEX.pinCodeRequest.test(line)) {
		return { type: LineType.PinCodeRequest };
	}

	if (BLUETOOTH_REGEX.pairingSuccess.test(line)) {
		return { type: LineType.PairingSuccess };
	}

	if (BLUETOOTH_REGEX.pairingFailure.test(line)) {
		return { type: LineType.PairingFailure, reason: line };
	}

	// Connection patterns
	if (BLUETOOTH_REGEX.connectionSuccess.test(line)) {
		return { type: LineType.ConnectionSuccess };
	}

	if (BLUETOOTH_REGEX.connectionFailure.test(line)) {
		return { type: LineType.ConnectionFailure, reason: line };
	}

	// Disconnect patterns
	if (BLUETOOTH_REGEX.disconnectSuccess.test(line)) {
		return { type: LineType.DisconnectSuccess };
	}

	if (BLUETOOTH_REGEX.disconnectFailure.test(line)) {
		return { type: LineType.DisconnectFailure, reason: line };
	}

	// Remove patterns
	if (BLUETOOTH_REGEX.removeSuccess.test(line)) {
		return { type: LineType.RemoveSuccess };
	}

	if (BLUETOOTH_REGEX.removeFailure.test(line)) {
		return { type: LineType.RemoveFailure, reason: line };
	}

	// Trust patterns
	if (BLUETOOTH_REGEX.trustSuccess.test(line)) {
		return { type: LineType.TrustSuccess };
	}

	if (BLUETOOTH_REGEX.trustFailure.test(line)) {
		return { type: LineType.TrustFailure, reason: line };
	}

	// Discoverable patterns
	if (BLUETOOTH_REGEX.discoverableSuccess?.test(line) ||
		line.includes("Changing discoverable on succeeded")) {
		return { type: LineType.DiscoverableSuccess };
	}

	if (BLUETOOTH_REGEX.discoverableFailure?.test(line) ||
		line.includes("Failed to set discoverable")) {
		return { type: LineType.DiscoverableFailure, reason: line };
	}

	if (BLUETOOTH_REGEX.undiscoverableSuccess?.test(line) ||
		line.includes("Changing discoverable off succeeded")) {
		return { type: LineType.UndiscoverableSuccess };
	}

	if (BLUETOOTH_REGEX.undiscoverableFailure?.test(line) ||
		line.includes("Failed to set discoverable")) {
		return { type: LineType.UndiscoverableFailure, reason: line };
	}

	// Default to unknown
	return { type: LineType.Unknown, rawLine: line };
}

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

	turnOn() { this.send("power on"); }

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

	async handleNewDevice(line: BluetoothctlLine): Promise<Device | null> {
		if (line.type !== LineType.DeviceNew) throw new Error("Invalid line type");
		return await Bluetoothctl.getDeviceInfo(line.device.mac);
	}

	async handlePasskeyConfirmation(
		line: BluetoothctlLine,
		device: Device | null,
		context: PairingContext
	): Promise<boolean> {
		const isIncoming = context === PairingContext.IncomingPairing;
		if (line.type !== LineType.PasskeyConfirmation) return false;
		const title = isIncoming
			? `Incoming Pairing Request`
			: `Pairing Confirmation Required`;

		let name;
		if (device) {
			name = device.name;
		} else {
			name = "A device";
		}

		const message = isIncoming
			? `${name} wants to pair with this device.\n\nDoes the passkey match on your device?\n\nPasskey: ${line.passkey}`
			: `${name} is requesting to pair.\n\nDoes the passkey match on both devices?\n\nPasskey: ${line.passkey}`;

		const confirm = await confirmAlert({
			title,
			message,
			dismissAction: { title: "Decline" },
			primaryAction: {
				title: "Accept",
				style: Alert.ActionStyle.Default
			},
		});

		if (confirm) {
			this.yes();
			await showToast({
				style: Toast.Style.Animated,
				title: "Pairing Accepted",
				message: isIncoming
					? `Accepting pairing request from ${name}...`
					: `Accepting pairing with ${name}...`,
			});
			return true;
		} else {
			this.no();
			await showToast({
				style: Toast.Style.Failure,
				title: "Pairing Declined",
				message: isIncoming
					? `Declined pairing request from ${name}`
					: "You declined the pairing confirmation.",
			});
			return false;
		}
	}

	async handlePinCodeRequest(
		line: BluetoothctlLine,
		device: Device | null,
		context: PairingContext
	): Promise<boolean> {
		if (!device) return false;
		const isIncoming = context === PairingContext.IncomingPairing;
		if (line.type !== LineType.PinCodeRequest) return false;
		const message = isIncoming
			? `Enter PIN Code for incoming pairing request from ${device.name}`
			: `Enter PIN Code for ${device.name}\n\n(This may be initiated by the device you're trying to pair with)`;

		throw new Error("handling pincode requests is not implemented");
	}

	async handlePairingSuccess(line: BluetoothctlLine): Promise<boolean> {
		if (line.type !== LineType.PairingSuccess) return false;
		await showToast({
			style: Toast.Style.Success,
			title: "Device Paired Successfully",
			message: `Successfully paired with ${line.device?.name}`,
		});
		return true;
	}

	async handlePairingFailure(line: BluetoothctlLine): Promise<boolean> {
		if (line.type !== LineType.PairingFailure) return false;
		await showToast({
			style: Toast.Style.Failure,
			title: "Pairing Failed",
			message: `Failed to pair with ${line.device?.name}: ${line.reason ?? "Unknown error"}`,
		});
		return false;
	}

	async handleAuthorizeService(line: BluetoothctlLine): Promise<boolean> {
		if (line.type !== LineType.AuthorizeService) return false;
		const confirm = await confirmAlert({
			title: "Authorize Service",
			message: `Authorize service ${line.uuid}?`,
			dismissAction: { title: "Decline" },
			primaryAction: {
				title: "Accept",
				style: Alert.ActionStyle.Default
			},
		});
		if (confirm) {
			this.yes();
			await showToast({
				style: Toast.Style.Animated,
				title: "Authorizing Service",
				message: `Authorizing service ${line.uuid}...`,
			});
			return true;
		} else {
			this.no();
			await showToast({
				style: Toast.Style.Failure,
				title: "Authorization Declined",
				message: `Declined authorization request for service ${line.uuid}`,
			});
			return false;
		}
	}

	static async setDiscoverable(state: "on" | "off"): Promise<BluetoothState | null> {
		try {
			const { stdout } = await execAsync(`bluetoothctl discoverable ${state}`);
			if (stdout.includes("Changing discoverable on succeeded")) {
				return await Bluetoothctl.getControllerInfo();
			}
			return null;
		} catch (error) {
			console.error("Error running bluetoothctl discoverable:", error);
			return null;
		}
	}

	static async setPower(state: "on" | "off"): Promise<BluetoothState | null> {
		try {
			const { stdout } = await execAsync(`bluetoothctl power ${state}`);
			if (stdout.includes("Changing power")) {
				return await Bluetoothctl.getControllerInfo();
			}
			return null;
		} catch (error) {
			console.error("Error running bluetoothctl power:", error);
			return null;
		}
	}

	static async getDeviceInfo(mac: string): Promise<Device | null> {
		try {
			const { stdout } = await execAsync(`bluetoothctl info ${mac}`);
			if (stdout) {
				let info = stdout.toString();
				let name = info.match(BLUETOOTH_REGEX.deviceName)?.[1] ?? mac;
				let connected = BLUETOOTH_REGEX.connectedStatus.test(info);
				let trusted = BLUETOOTH_REGEX.trustedStatus.test(info);
				let icon = getIconFromInfo(info);
				return new Device(
					mac,
					name,
					icon,
					connected,
					trusted
				);
			} else {
				console.error("Error running bluetoothctl info:", stdout);
				return null;
			}
		} catch (error) {
			console.error("Error running bluetoothctl info:", error);
			return null;
		}
	}

	static async getControllerInfo(): Promise<BluetoothState | null> {
		try {
			const { stdout } = await execAsync(`bluetoothctl show`);
			// Parse the output to extract BluetoothState fields
			const lines = stdout.toString().split('\n');

			let name = '';
			let powered = false;
			let discoverable = false;
			let discovering = false;
			let pairable = false;

			for (const line of lines) {
				const trimmed = line.trim();

				if (trimmed.startsWith('Name:')) {
					name = trimmed.substring(5).trim();
				} else if (trimmed.startsWith('Powered:')) {
					powered = trimmed.substring(8).trim().toLowerCase() === 'yes';
				} else if (trimmed.startsWith('Discoverable:')) {
					discoverable = trimmed.substring(13).trim().toLowerCase() === 'yes';
				} else if (trimmed.startsWith('Discovering:')) {
					discovering = trimmed.substring(12).trim().toLowerCase() === 'yes';
				} else if (trimmed.startsWith('Pairable:')) {
					pairable = trimmed.substring(9).trim().toLowerCase() === 'yes';
				}
			}

			return { name, powered, discoverable, discovering, pairable };
		} catch (err) {
			console.error("Error running bluetoothctl show:", err);
			return null;
		}
	}

	static async listDevices(devicesOpts?: DeviceOptions):
		Promise<{ mac: string; name: string }[]> {
		try {
			const { stdout } = await execAsync("bluetoothctl devices " + (devicesOpts ? devicesOpts : ""));

			return stdout
				.trim()
				.split("\n")
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

	removeLineHandler(handler: (line: BluetoothctlLine) => void) {
		const index = this.lineHandlers.indexOf(handler);
		if (index > -1) {
			this.lineHandlers.splice(index, 1);
		}
	}
}

export async function pairToDevice(device: Device): Promise<void> {
	throw new Error("pairToDevice is not implemented");
	// await showToast({
	// 	style: Toast.Style.Animated,
	// 	title: `Pairing to ${device.name}...`,
	// });
	//
	// return new Promise<void>((resolve, reject) => {
	// 	const bt = new Bluetoothctl();
	// 	const timeout = setTimeout(() => {
	// 		bt.kill();
	// 		reject(console.error("Pairing timed out"));
	// 	}, 20000);
	//
	// 	// Set up line handler for pairing events using the unified handler
	// 	const handlePairingLine = async (line: BluetoothctlLine) => {
	// 		const shouldContinue = await handlePairingEvent(line, bt, device, PairingContext.OutgoingPairing);
	//
	// 		if (!shouldContinue) {
	// 			clearTimeout(timeout);
	// 			bt.kill();
	// 			reject(console.error("Pairing cancelled or failed"));
	// 			return;
	// 		}
	//
	// 		// Handle completion events
	// 		switch (line.type) {
	// 			case LineType.PairingSuccess: {
	// 				clearTimeout(timeout);
	// 				bt.kill();
	// 				resolve();
	// 				break;
	// 			}
	//
	// 			case LineType.PairingFailure: {
	// 				clearTimeout(timeout);
	// 				bt.kill();
	// 				reject(console.error(line.reason));
	// 				break;
	// 			}
	// 		}
	// 	};
	//
	// 	bt.onLine(handlePairingLine);
	// 	bt.pair(device.mac);
	// });
}

export async function connectToDevice(device: Device): Promise<void> {
	console.log("connecting to device: " + device.name);
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
				case LineType.ConnectionSuccess: {
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

				case LineType.ConnectionFailure: {
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
				case LineType.DisconnectSuccess: {
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

				case LineType.DisconnectFailure: {
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

export async function removeDevice(device: Device): Promise<void> {
	await showToast({
		style: Toast.Style.Animated,
		title: `Removing ${device.name}`,
	});

	return new Promise<void>((resolve, reject) => {
		const bt = new Bluetoothctl();
		const timeout = setTimeout(() => {
			bt.kill();
			reject(console.error("Removal timed out"));
		}, 10000);

		const handleRemoveLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case LineType.RemoveSuccess: {
					clearTimeout(timeout);
					bt.kill();
					await showToast({
						style: Toast.Style.Success,
						title: "Removed",
						message: `${device.name} removed successfully`,
					});
					resolve();
					break;
				}

				case LineType.RemoveFailure: {
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
				case LineType.TrustSuccess: {
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

				case LineType.TrustFailure: {
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

export async function fetchDevices(option: DeviceOptions): Promise<Device[]> {
	const list: Device[] = [];
	const paired = await Bluetoothctl.listDevices(option);
	for (const { mac } of paired) {
		try {
			const device = await Bluetoothctl.getDeviceInfo(mac);
			if (device) {
				list.push(device);
			}
		} catch (err) {
			console.error(`Failed to get info for ${mac}:`, err);
		}
	}
	return list.sort((a, b) => a.name.localeCompare(b.name));
}
