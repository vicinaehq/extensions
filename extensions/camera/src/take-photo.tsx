import { getPreferenceValues } from "@vicinae/api";
import { TakePhotoPreferences } from "./types";
import {
	applyPostCaptureActions,
	capturePhoto,
	describePostCaptureOutcome,
	handleError,
	isCameraBackendAvailable,
	listCameraDevices,
	showSuccess,
} from "./utils";

export default async function TakePhoto() {
	const preferences = getPreferenceValues<TakePhotoPreferences>();

	if (!isCameraBackendAvailable()) {
		await handleError(
			"Camera support is unavailable.",
			new Error(
				"The v4l2camera native module could not be loaded. It only works on Linux and needs a C/C++ toolchain to build.",
			),
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
		const outcome = await applyPostCaptureActions(outputPath, preferences);
		const warning = describePostCaptureOutcome(outcome);
		await showSuccess("Photo captured", warning ?? outputPath);
	} catch (error) {
		await handleError("Failed to capture photo.", error);
	}
}
