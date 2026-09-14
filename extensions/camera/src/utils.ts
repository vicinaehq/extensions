import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { encode as encodeJpeg } from "jpeg-js";
import type * as V4l2Camera from "v4l2camera";
import { Clipboard, open, showToast, Toast } from "@vicinae/api";
import { CameraDevice, Preferences } from "./types";

type V4l2CameraModule = typeof V4l2Camera;

let cameraModule: V4l2CameraModule | null | undefined;

/**
 * v4l2camera is an optional native dependency: it only builds on Linux, where
 * video4linux2 headers are available. On any other platform (or when the
 * native build failed), `require` throws and we treat camera support as
 * unavailable rather than crashing the extension.
 */
function getCameraModule(): V4l2CameraModule | null {
	if (cameraModule !== undefined) return cameraModule;
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		cameraModule = require("v4l2camera") as V4l2CameraModule;
	} catch {
		cameraModule = null;
	}
	return cameraModule;
}

export function isCameraBackendAvailable(): boolean {
	return getCameraModule() !== null;
}

export async function listCameraDevices(): Promise<CameraDevice[]> {
	const candidates = await listCameraDevicesFromSysfs();
	const module = getCameraModule();
	if (!module) return candidates;

	const devices: CameraDevice[] = [];
	for (const candidate of candidates) {
		if (deviceSupportsCapture(module, candidate.path)) {
			devices.push(candidate);
		}
	}
	return devices;
}

async function listCameraDevicesFromSysfs(): Promise<CameraDevice[]> {
	let entries: string[] = [];
	try {
		entries = await fs.readdir("/dev");
	} catch {
		return [];
	}

	const videoNodes = entries
		.filter((name) => /^video\d+$/.test(name))
		.sort(
			(a, b) => Number(a.replace("video", "")) - Number(b.replace("video", "")),
		);

	const devices: CameraDevice[] = [];
	for (const node of videoNodes) {
		const index = node.replace("video", "");
		const devicePath = path.join("/dev", node);
		let label = `Camera ${index}`;
		try {
			const name = (
				await fs.readFile(`/sys/class/video4linux/${node}/name`, "utf8")
			).trim();
			if (name) label = name;
		} catch {
			// keep the generic label if sysfs metadata isn't available
		}
		devices.push({ path: devicePath, label });
	}

	return devices;
}

function deviceSupportsCapture(
	module: V4l2CameraModule,
	devicePath: string,
): boolean {
	// v4l2camera exposes no explicit close/dispose method (matching its own
	// documented usage); the device fd is released when this Camera instance
	// is garbage-collected, same as the library's own examples rely on.
	try {
		const camera = new module.Camera(devicePath);
		return camera.formats.length > 0;
	} catch {
		return false;
	}
}

function pickFormatForResolution(
	camera: InstanceType<V4l2CameraModule["Camera"]>,
	resolution?: string,
): V4l2Camera.CameraFormat | undefined {
	if (!resolution || resolution === "auto") return undefined;
	const [width, height] = resolution.split("x").map(Number);
	return camera.formats.find(
		(format) => format.width === width && format.height === height,
	);
}

function rgbToRgba(rgb: Uint8Array): Uint8Array {
	const pixelCount = Math.floor(rgb.length / 3);
	const rgba = new Uint8Array(pixelCount * 4);
	for (let i = 0; i < pixelCount; i++) {
		rgba[i * 4] = rgb[i * 3];
		rgba[i * 4 + 1] = rgb[i * 3 + 1];
		rgba[i * 4 + 2] = rgb[i * 3 + 2];
		rgba[i * 4 + 3] = 255;
	}
	return rgba;
}

function encodeFrameAsJpeg(
	camera: InstanceType<V4l2CameraModule["Camera"]>,
): Buffer {
	const format = camera.configGet();
	if (format.formatName === "MJPG") {
		return Buffer.from(camera.frameRaw());
	}
	const rgba = rgbToRgba(camera.toRGB());
	const { data } = encodeJpeg(
		{ data: rgba, width: camera.width, height: camera.height },
		90,
	);
	return data;
}

const CAPTURE_TIMEOUT_MS = 8000;

function safeStop(camera: InstanceType<V4l2CameraModule["Camera"]>): void {
	try {
		camera.stop();
	} catch {
		// device already released, or was never started
	}
}

/**
 * Opens the given device, captures exactly one frame, and returns it JPEG-encoded.
 * The device is only held open for the duration of the capture, so this can be
 * called repeatedly (e.g. for a refreshing preview) without leaving the camera busy.
 *
 * Guarded by a timeout: a misbehaving driver or a device that disconnects
 * mid-capture could otherwise leave `camera.capture()`'s callback never firing,
 * which would hang the caller (and, for the preview loop, wedge it) forever.
 */
export function captureFrameBuffer(
	device: CameraDevice,
	resolution?: string,
): Promise<Buffer> {
	const module = getCameraModule();
	if (!module) {
		return Promise.reject(
			new Error(
				"Camera support is unavailable: the v4l2camera native module could not be loaded.",
			),
		);
	}

	return new Promise((resolve, reject) => {
		let settled = false;
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			fn();
		};

		let camera: InstanceType<V4l2CameraModule["Camera"]>;
		try {
			camera = new module.Camera(device.path);
		} catch (error) {
			settle(() =>
				reject(error instanceof Error ? error : new Error(String(error))),
			);
			return;
		}

		const timeout = setTimeout(() => {
			safeStop(camera);
			settle(() =>
				reject(new Error(`${device.label} timed out while capturing a frame.`)),
			);
		}, CAPTURE_TIMEOUT_MS);

		try {
			const format = pickFormatForResolution(camera, resolution);
			if (format) camera.configSet(format);
			camera.start();
		} catch (error) {
			clearTimeout(timeout);
			safeStop(camera);
			settle(() =>
				reject(error instanceof Error ? error : new Error(String(error))),
			);
			return;
		}

		camera.capture((success) => {
			clearTimeout(timeout);
			try {
				if (!success) {
					throw new Error(`${device.label} did not return a frame.`);
				}
				const buffer = encodeFrameAsJpeg(camera);
				settle(() => resolve(buffer));
			} catch (error) {
				settle(() =>
					reject(error instanceof Error ? error : new Error(String(error))),
				);
			} finally {
				safeStop(camera);
			}
		});
	});
}

function expandHome(inputPath: string): string {
	if (inputPath === "~") return os.homedir();
	if (inputPath.startsWith("~/"))
		return path.join(os.homedir(), inputPath.slice(2));
	return inputPath;
}

/**
 * Captures a photo and writes it to disk. This only rejects when the capture
 * itself fails; clipboard/open side effects are applied separately by the
 * caller via {@link applyPostCaptureActions} so an optional-action failure is
 * never mistaken for a failed capture.
 */
export async function capturePhoto(
	device: CameraDevice,
	preferences: Pick<Preferences, "save_directory" | "resolution">,
): Promise<string> {
	const saveDirectory = expandHome(
		preferences.save_directory || "~/Pictures/Webcam",
	);
	await fs.mkdir(saveDirectory, { recursive: true });

	const jpegBuffer = await captureFrameBuffer(device, preferences.resolution);

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const outputPath = path.join(saveDirectory, `webcam-${timestamp}.jpg`);
	await fs.writeFile(outputPath, jpegBuffer);

	return outputPath;
}

export type PostCaptureOutcome = {
	copyError?: string;
	openError?: string;
};

/**
 * Applies the "Copy to Clipboard" / "Open After Capture" preferences to an
 * already-captured photo. Failures here are reported back to the caller
 * instead of being thrown, since the photo itself was already captured
 * successfully and that shouldn't be reported as a capture failure.
 */
export async function applyPostCaptureActions(
	outputPath: string,
	preferences: Pick<Preferences, "copy_to_clipboard" | "open_after_capture">,
): Promise<PostCaptureOutcome> {
	const outcome: PostCaptureOutcome = {};

	if (preferences.copy_to_clipboard) {
		try {
			await Clipboard.copy({ file: outputPath });
		} catch (error) {
			outcome.copyError =
				error instanceof Error ? error.message : "Unknown error";
		}
	}

	if (preferences.open_after_capture) {
		try {
			await open(outputPath);
		} catch (error) {
			outcome.openError =
				error instanceof Error ? error.message : "Unknown error";
		}
	}

	return outcome;
}

export function describePostCaptureOutcome(
	outcome: PostCaptureOutcome,
): string | undefined {
	const issues: string[] = [];
	if (outcome.copyError)
		issues.push(`clipboard copy failed (${outcome.copyError})`);
	if (outcome.openError) issues.push(`could not open (${outcome.openError})`);
	if (issues.length === 0) return undefined;
	return `Photo saved, but ${issues.join(" and ")}.`;
}

export function showSuccess(title: string, message?: string) {
	return showToast({
		style: Toast.Style.Success,
		title,
		...(message && { message }),
	});
}

export function handleError(title: string, error: unknown) {
	return showToast({
		style: Toast.Style.Failure,
		title,
		message: error instanceof Error ? error.message : "Unknown error",
	});
}
