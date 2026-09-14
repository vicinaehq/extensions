import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { Clipboard, open, showToast, Toast } from "@vicinae/api";
import { CameraDevice, Preferences } from "./types";

const execFileAsync = promisify(execFile);

const CAPTURE_TIMEOUT_MS = 10_000;

export async function isFfmpegInstalled(): Promise<boolean> {
	try {
		await execFileAsync("which", ["ffmpeg"]);
		return true;
	} catch {
		return false;
	}
}

export async function listCameraDevices(): Promise<CameraDevice[]> {
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

function resolutionArgs(resolution?: string): string[] {
	if (!resolution || resolution === "auto") return [];
	return ["-video_size", resolution];
}

/**
 * Captures exactly one frame from the given device and writes it to
 * `outputPath` as a JPEG. Guarded by a timeout (via ffmpeg's child process,
 * not a hand-rolled one) so a misbehaving device or driver can't hang the
 * caller - important since this also drives the repeating live preview.
 */
export async function captureFrameToFile(
	device: CameraDevice,
	outputPath: string,
	resolution?: string,
): Promise<void> {
	try {
		await execFileAsync(
			"ffmpeg",
			[
				"-y",
				"-hide_banner",
				"-loglevel",
				"error",
				"-f",
				"v4l2",
				...resolutionArgs(resolution),
				"-i",
				device.path,
				"-ss",
				"00:00:01",
				"-frames:v",
				"1",
				outputPath,
			],
			{ timeout: CAPTURE_TIMEOUT_MS, killSignal: "SIGKILL" },
		);
	} catch (error) {
		if (
			error instanceof Error &&
			"killed" in error &&
			(error as { killed?: boolean }).killed
		) {
			throw new Error(`${device.label} timed out while capturing a frame.`);
		}
		throw error;
	}
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

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const outputPath = path.join(saveDirectory, `webcam-${timestamp}.jpg`);
	await captureFrameToFile(device, outputPath, preferences.resolution);

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
