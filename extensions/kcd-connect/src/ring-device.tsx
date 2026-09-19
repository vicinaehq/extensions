import { ringDevice } from "./lib/client";
import { performOnTarget } from "./lib/devices/act";

export default async function RingDeviceCommand() {
	await performOnTarget((device) => ringDevice(device.id), {
		failureTitle: "Could not ring the device",
		success: (device) => ({
			title: "Ringing",
			message: device.name,
		}),
	});
}
