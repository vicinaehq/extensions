import { getPreferenceValues } from "@vicinae/api";
import { TakePhotoPreferences } from "./types";
import {
	capturePhoto,
	handleError,
	isFfmpegInstalled,
	listCameraDevices,
	showSuccess,
} from "./utils";

export default async function TakePhoto() {
	const preferences = getPreferenceValues<TakePhotoPreferences>();

	if (!(await isFfmpegInstalled())) {
		await handleError(
			"ffmpeg is required to take a photo.",
			new Error("ffmpeg was not found in PATH. Install it and try again."),
		);
		return;
	}

	const requestedPath = preferences.default_device?.trim();
	const devices = await listCameraDevices();

	const device = requestedPath
		? (devices.find((d) => d.path === requestedPath) ?? {
				path: requestedPath,
				label: requestedPath,
			})
		: devices[0];

	if (!device) {
		await handleError(
			"No camera found.",
			new Error("No video capture device was detected on this system."),
		);
		return;
	}

	try {
		const outputPath = await capturePhoto(device, preferences);
		await showSuccess("Photo captured", outputPath);
	} catch (error) {
		await handleError("Failed to capture photo.", error);
	}
}
