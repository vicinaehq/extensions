import { showToast, Toast } from "@vicinae/api";
import { Bluetooth } from "@/bluetooth";

export default async function BluetoothOff() {
	const success = await Bluetooth.powerOff();

	if (!success) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Failed to turn Bluetooth off",
			message: "Could not power off the Bluetooth adapter",
		});
		return;
	}

	await showToast({
		style: Toast.Style.Success,
		title: "Bluetooth Off",
		message: "Bluetooth adapter powered off",
	});
}
