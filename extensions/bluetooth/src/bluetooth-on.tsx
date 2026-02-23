import { showToast, Toast } from "@vicinae/api";
import { Bluetooth, connectToDevice, type Device } from "@/bluetooth";
import { isConnectedStatus } from "@/utils";

export default async function BluetoothOn() {
	const success = await Bluetooth.powerOn();

	if (!success) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Failed to turn Bluetooth on",
			message: "Could not power on the Bluetooth adapter",
		});
		return;
	}

	await showToast({
		style: Toast.Style.Success,
		title: "Bluetooth On",
		message: "Bluetooth adapter powered on",
	});

	// Try to reconnect to last connected device
	const last = await Bluetooth.getLastConnected();
	if (!last) return;

	try {
		const info = await Bluetooth.getInfo(last.mac);
		if (!isConnectedStatus(info)) {
			const device: Device = {
				mac: last.mac,
				name: last.name,
				icon: "",
				connected: false,
				trusted: false,
			};
			await connectToDevice(device);
		}
	} catch {
		// Device may be out of range or off - silently ignore
	}
}
