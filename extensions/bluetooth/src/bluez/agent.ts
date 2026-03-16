/**
 * BlueZ Agent (org.bluez.Agent1) - D-Bus service for pairing dialogs.
 */

import { Alert, confirmAlert, showToast, Toast } from "@vicinae/api";
import * as dbus from "dbus-next";
import { getDeviceProperties } from "./device";
import { devicePathToMac } from "./types";

const AGENT_PATH = "/org/bluez/agent/vicinae";
const AGENT_CAPABILITY = "KeyboardDisplay"; // Supports both PIN and passkey confirmation
const BLUEZ_SERVICE = "org.bluez";

let agentInstance: dbus.interface.Interface | null = null;
let registrationCleanup: (() => Promise<void>) | null = null;

/** Notify when pairing starts (for discoverable UI "pairing with X") */
export let onPairingStarted: ((devicePath: string) => void) | null = null;

export function setOnPairingStarted(cb: ((devicePath: string) => void) | null) {
	onPairingStarted = cb;
}

/** Notify when pairing ends (cancel/reject) so UI can clear "pairing with X" */
export let onPairingEnded: (() => void) | null = null;

export function setOnPairingEnded(cb: (() => void) | null) {
	onPairingEnded = cb;
}

async function getDeviceName(devicePath: string): Promise<string> {
	try {
		const props = await getDeviceProperties(devicePathToMac(devicePath));
		return (props?.Name as string) ?? (props?.Alias as string) ?? "Device";
	} catch {
		return "Device";
	}
}

const { Interface } = dbus.interface;
const { DBusError } = dbus;

// Agent implementation using configureMembers (no decorators)
class BluetoothAgent extends Interface {
	Release() {}

	async RequestPinCode(device: string): Promise<string> {
		onPairingStarted?.(device);
		const name = await getDeviceName(device);
		const pin = prompt(
			`Enter PIN Code for ${name}\n\n(This may be initiated by the device you're trying to pair with)`,
		);
		if (!pin)
			throw new DBusError("org.bluez.Error.Canceled", "PIN entry cancelled");
		if (pin.length < 1 || pin.length > 16)
			throw new DBusError("org.bluez.Error.Rejected", "Invalid PIN length");
		await showToast({
			style: Toast.Style.Animated,
			title: "PIN entered",
			message: `Pairing with ${name}...`,
		});
		return pin;
	}

	DisplayPinCode(_device: string, pincode: string) {
		showToast({
			style: Toast.Style.Success,
			title: "Enter PIN on device",
			message: `PIN: ${pincode}`,
		});
	}

	async RequestPasskey(device: string): Promise<number> {
		onPairingStarted?.(device);
		const name = await getDeviceName(device);
		const input = prompt(`Enter 6-digit Passkey for ${name}`);
		if (!input)
			throw new DBusError(
				"org.bluez.Error.Canceled",
				"Passkey entry cancelled",
			);
		const passkey = parseInt(input.trim(), 10);
		if (Number.isNaN(passkey) || passkey < 0 || passkey > 999999)
			throw new DBusError("org.bluez.Error.Rejected", "Invalid passkey");
		return passkey;
	}

	DisplayPasskey(_device: string, passkey: number, _entered?: number) {
		showToast({
			style: Toast.Style.Success,
			title: "Enter passkey on device",
			message: `Passkey: ${passkey.toString().padStart(6, "0")}`,
		});
	}

	async RequestConfirmation(device: string, passkey: number): Promise<void> {
		onPairingStarted?.(device);
		const name = await getDeviceName(device);
		const formatted = passkey.toString().padStart(6, "0");
		const confirm = await confirmAlert({
			title: "Pairing Confirmation",
			message: `Does the passkey match on both devices?\n\n${name}\nPasskey: ${formatted}`,
			primaryAction: { title: "Accept", style: Alert.ActionStyle.Default },
			dismissAction: { title: "Decline" },
		});
		if (!confirm)
			throw new DBusError("org.bluez.Error.Rejected", "User declined pairing");
		await showToast({
			style: Toast.Style.Animated,
			title: "Pairing...",
			message: `Connecting to ${name}`,
		});
	}

	async RequestAuthorization(device: string): Promise<void> {
		onPairingStarted?.(device);
		const name = await getDeviceName(device);
		const confirm = await confirmAlert({
			title: "Authorize Pairing",
			message: `Authorize connection to ${name}?`,
			primaryAction: { title: "Accept", style: Alert.ActionStyle.Default },
			dismissAction: { title: "Decline" },
		});
		if (!confirm)
			throw new DBusError(
				"org.bluez.Error.Rejected",
				"User declined authorization",
			);
	}

	AuthorizeService(_device: string, _uuid: string) {}

	Cancel() {
		onPairingEnded?.();
	}
}

BluetoothAgent.configureMembers({
	methods: {
		Release: { inSignature: "", outSignature: "" },
		RequestPinCode: { inSignature: "o", outSignature: "s" },
		DisplayPinCode: { inSignature: "os", outSignature: "" },
		RequestPasskey: { inSignature: "o", outSignature: "u" },
		DisplayPasskey: { inSignature: "ouq", outSignature: "" },
		RequestConfirmation: { inSignature: "ou", outSignature: "" },
		RequestAuthorization: { inSignature: "o", outSignature: "" },
		AuthorizeService: { inSignature: "os", outSignature: "" },
		Cancel: { inSignature: "", outSignature: "" },
	},
});

export async function registerAgent(): Promise<void> {
	if (agentInstance) return;

	const bus = dbus.systemBus();
	agentInstance = new BluetoothAgent("org.bluez.Agent1");
	bus.export(AGENT_PATH, agentInstance);

	const obj = await bus.getProxyObject(BLUEZ_SERVICE, "/org/bluez");
	const agentMgr = obj.getInterface("org.bluez.AgentManager1");
	await agentMgr.RegisterAgent(AGENT_PATH, AGENT_CAPABILITY);
	await agentMgr.RequestDefaultAgent(AGENT_PATH);

	registrationCleanup = async () => {
		try {
			await agentMgr.UnregisterAgent(AGENT_PATH);
		} catch {
			// Ignore if already unregistered
		}
		agentInstance = null;
		registrationCleanup = null;
	};
}

export async function unregisterAgent(): Promise<void> {
	if (registrationCleanup) {
		await registrationCleanup();
	}
}
