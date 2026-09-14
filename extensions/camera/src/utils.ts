import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { Clipboard, open, showToast, Toast } from "@vicinae/api";
import { CameraDevice, Preferences } from "./types";

const execFileAsync = promisify(execFile);

const CAPTURE_TIMEOUT_MS = 10_000;

// Vicinae currently ships for Linux and macOS only (no Windows builds exist
// yet), so those are the only two device backends implemented here.
const platform = os.platform();

export async function isFfmpegInstalled(): Promise<boolean> {
	try {
		await execFileAsync("which", ["ffmpeg"]);
		return true;
	} catch {
		return false;
	}
}

export async function listCameraDevices(): Promise<CameraDevice[]> {
	if (platform === "darwin") return listCameraDevicesMacOS();
	return listCameraDevicesLinux();
}

async function listCameraDevicesLinux(): Promise<CameraDevice[]> {
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

/**
 * ffmpeg's avfoundation input lists its devices by printing to stderr and
 * then failing (there's no dedicated "list only" exit path), when given an
 * empty input. Video and screen-capture "devices" share the same section, so
 * "Capture screen N" pseudo-devices are filtered out.
 */
async function listCameraDevicesMacOS(): Promise<CameraDevice[]> {
	let stderr = "";
	try {
		await execFileAsync(
			"ffmpeg",
			["-f", "avfoundation", "-list_devices", "true", "-i", ""],
			{
				timeout: CAPTURE_TIMEOUT_MS,
			},
		);
	} catch (error) {
		stderr = (error as { stderr?: string }).stderr ?? "";
	}

	const devices: CameraDevice[] = [];
	let inVideoSection = false;

	for (const line of stderr.split("\n")) {
		if (line.includes("AVFoundation video devices:")) {
			inVideoSection = true;
			continue;
		}
		if (line.includes("AVFoundation audio devices:")) {
			inVideoSection = false;
			continue;
		}
		if (!inVideoSection) continue;

		const match = line.match(/\[(\d+)\]\s+(.+)$/);
		if (!match) continue;
		const label = match[2].trim();
		if (/^capture screen/i.test(label)) continue;
		devices.push({ path: match[1], label });
	}

	return devices;
}

function resolutionArgs(resolution?: string): string[] {
	if (!resolution || resolution === "auto") return [];
	return ["-video_size", resolution];
}

/**
 * Builds the complete set of ffmpeg input-side flags for the given device.
 * These all have to precede `-i` to actually apply to that input - notably
 * `-video_size` (and, on macOS, `-framerate`) are silently ignored by ffmpeg
 * if placed after `-i` instead.
 */
function inputArgs(
	device: CameraDevice,
	resolution?: string,
	framerate?: string,
): string[] {
	const resArgs = resolutionArgs(resolution);
	if (platform === "darwin") {
		const frameArgs = framerate ? ["-framerate", framerate] : [];
		// ":none" disables audio capture - without it ffmpeg also tries to grab
		// a default microphone, which can fail or trigger an extra permission
		// prompt we don't need for a photo/preview feature.
		return [
			"-f",
			"avfoundation",
			...frameArgs,
			...resArgs,
			"-i",
			`${device.path}:none`,
		];
	}
	return ["-f", "v4l2", ...resArgs, "-i", device.path];
}

type SupportedMode = { width: number; height: number; framerate: number };

/**
 * When avfoundation rejects a requested resolution/framerate combination, it
 * reports the modes the device actually supports in its stderr output, e.g.
 * "1920x1080@[15.000000 30.000000]fps". Parsed so a failed capture can be
 * retried once with a mode the device has just told us it supports, instead
 * of guessing at a "safe" default that varies from device to device.
 */
function parseSupportedModes(stderr: string): SupportedMode[] {
	const modes: SupportedMode[] = [];
	const re = /(\d+)x(\d+)@\[[\d.]+\s+([\d.]+)\]fps/g;
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
	while ((match = re.exec(stderr))) {
		modes.push({
			width: Number(match[1]),
			height: Number(match[2]),
			framerate: Number(match[3]),
		});
	}
	return modes;
}

function pickFallbackMode(
	modes: SupportedMode[],
	resolution?: string,
): SupportedMode {
	if (resolution && resolution !== "auto") {
		const [width, height] = resolution.split("x").map(Number);
		const exact = modes.find(
			(mode) => mode.width === width && mode.height === height,
		);
		if (exact) return exact;
	}
	return modes[0];
}

async function runFfmpegCapture(
	device: CameraDevice,
	outputPath: string,
	resolution: string | undefined,
	framerate: string | undefined,
): Promise<void> {
	await execFileAsync(
		"ffmpeg",
		[
			"-y",
			"-hide_banner",
			"-loglevel",
			"error",
			...inputArgs(device, resolution, framerate),
			"-ss",
			"00:00:01",
			"-frames:v",
			"1",
			outputPath,
		],
		{ timeout: CAPTURE_TIMEOUT_MS, killSignal: "SIGKILL" },
	);
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
		// avfoundation's own default framerate (29.97fps) is rejected by many
		// cameras, which only support exact values like 15 or 30 - 30 is a
		// reasonable first guess, corrected below if this specific device
		// disagrees.
		await runFfmpegCapture(
			device,
			outputPath,
			resolution,
			platform === "darwin" ? "30" : undefined,
		);
	} catch (error) {
		if (isTimeoutError(error)) {
			throw new Error(timeoutErrorMessage(device));
		}

		if (platform === "darwin") {
			const modes = parseSupportedModes(getStderr(error));
			if (modes.length > 0) {
				const fallback = pickFallbackMode(modes, resolution);
				try {
					await runFfmpegCapture(
						device,
						outputPath,
						`${fallback.width}x${fallback.height}`,
						String(fallback.framerate),
					);
					return;
				} catch (retryError) {
					if (isTimeoutError(retryError)) {
						throw new Error(timeoutErrorMessage(device));
					}
					throw retryError;
				}
			}
		}

		throw error;
	}
}

/**
 * On macOS, a capture timeout with no camera-permission prompt ever shown (and
 * no entry created under System Settings > Privacy & Security > Camera to
 * even grant it) is a known limitation: TCC doesn't always prompt for a plain
 * CLI binary chained under Vicinae's extension host the way it does for a
 * properly-bundled, code-signed app. This can't be fixed from inside a
 * third-party extension - it would need to be addressed in Vicinae itself.
 */
function timeoutErrorMessage(device: CameraDevice): string {
	if (platform === "darwin") {
		return `${device.label} timed out and macOS never showed a camera permission prompt. This is a known Vicinae/macOS limitation, not something this extension can fix on its own.`;
	}
	return `${device.label} timed out while capturing a frame.`;
}

function isTimeoutError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"killed" in error &&
		(error as { killed?: boolean }).killed === true
	);
}

function getStderr(error: unknown): string {
	return (error as { stderr?: string })?.stderr ?? "";
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
