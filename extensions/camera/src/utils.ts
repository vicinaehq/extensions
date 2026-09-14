import { execFile, spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { Clipboard, LocalStorage, open, showToast, Toast } from "@vicinae/api";
import { ActivePreviewSession, CameraDevice, Preferences } from "./types";

const execFileAsync = promisify(execFile);

const ACTIVE_PREVIEW_KEY = "camera_active_preview_session";

export async function isCommandInstalled(command: string): Promise<boolean> {
	try {
		await execFileAsync("which", [command]);
		return true;
	} catch {
		return false;
	}
}

export const isFfmpegInstalled = () => isCommandInstalled("ffmpeg");
export const isFfplayInstalled = () => isCommandInstalled("ffplay");

export async function listCameraDevices(): Promise<CameraDevice[]> {
	if (await isCommandInstalled("v4l2-ctl")) {
		try {
			const devices = await listCameraDevicesWithV4l2Ctl();
			if (devices.length > 0) return devices;
		} catch {
			// fall through to the sysfs-based fallback below
		}
	}
	return listCameraDevicesFromSysfs();
}

async function listCameraDevicesWithV4l2Ctl(): Promise<CameraDevice[]> {
	const { stdout } = await execFileAsync("v4l2-ctl", ["--list-devices"]);
	const blocks = stdout
		.split(/\n(?=\S)/)
		.filter((block) => block.trim().length > 0);
	const devices: CameraDevice[] = [];

	for (const block of blocks) {
		const lines = block
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		if (lines.length < 2) continue;

		const label = lines[0]
			.replace(/:$/, "")
			.replace(/\s*\([^)]*\)\s*$/, "")
			.trim();
		const nodes = lines.slice(1);

		let chosen: string | null = null;
		for (const node of nodes) {
			if (await nodeSupportsCapture(node)) {
				chosen = node;
				break;
			}
		}

		devices.push({ path: chosen ?? nodes[0], label: label || nodes[0] });
	}

	return devices;
}

async function nodeSupportsCapture(devicePath: string): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("v4l2-ctl", [
			"-d",
			devicePath,
			"--info",
		]);
		return stdout.includes("Video Capture");
	} catch {
		return false;
	}
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

function resolutionArgs(resolution?: string): string[] {
	if (!resolution || resolution === "auto") return [];
	return ["-video_size", resolution];
}

export async function getActivePreviewSession(): Promise<ActivePreviewSession | null> {
	try {
		const raw = await LocalStorage.getItem<string>(ACTIVE_PREVIEW_KEY);
		if (!raw) return null;
		const session: ActivePreviewSession = JSON.parse(raw);
		if (session.pid && (await isPreviewPidRunning(session.pid))) {
			return session;
		}
		await LocalStorage.removeItem(ACTIVE_PREVIEW_KEY);
		return null;
	} catch {
		return null;
	}
}

async function isPreviewPidRunning(pid: number): Promise<boolean> {
	try {
		process.kill(pid, 0);
		const { stdout } = await execFileAsync("ps", [
			"-p",
			String(pid),
			"-o",
			"comm=",
		]);
		return stdout.trim().includes("ffplay");
	} catch {
		return false;
	}
}

export async function startCameraPreview(
	device: CameraDevice,
	resolution?: string,
): Promise<boolean> {
	if (await getActivePreviewSession()) {
		await stopCameraPreview();
	}

	if (!(await isFfplayInstalled())) {
		handleError(
			"ffplay is required for live preview.",
			new Error(
				"ffplay was not found in PATH. Install the ffmpeg package to get it.",
			),
		);
		return false;
	}

	let child: ReturnType<typeof spawn> | null = null;
	try {
		child = spawn(
			"ffplay",
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-f",
				"v4l2",
				...resolutionArgs(resolution),
				"-i",
				device.path,
				"-window_title",
				`${device.label} — Vicinae Camera`,
			],
			{ stdio: "ignore", detached: true },
		);

		if (!child.pid) {
			throw new Error("Failed to spawn ffplay process.");
		}

		child.unref();

		const session: ActivePreviewSession = {
			pid: child.pid,
			path: device.path,
			label: device.label,
		};
		await LocalStorage.setItem(ACTIVE_PREVIEW_KEY, JSON.stringify(session));
		showSuccess("Camera preview started", device.label);
		return true;
	} catch (error) {
		if (child?.pid) {
			try {
				process.kill(child.pid, "SIGTERM");
			} catch {
				// process already exited
			}
		}
		handleError("Failed to start camera preview.", error);
		return false;
	}
}

export async function stopCameraPreview(): Promise<boolean> {
	try {
		const session = await getActivePreviewSession();
		if (!session) {
			await LocalStorage.removeItem(ACTIVE_PREVIEW_KEY);
			return true;
		}

		try {
			process.kill(session.pid, "SIGTERM");
		} catch {
			// process already exited
		}

		await LocalStorage.removeItem(ACTIVE_PREVIEW_KEY);
		showSuccess("Camera preview stopped");
		return true;
	} catch (error) {
		handleError("Failed to stop camera preview.", error);
		return false;
	}
}

export async function capturePhoto(
	device: CameraDevice,
	preferences: Preferences,
): Promise<string> {
	const saveDirectory = expandHome(
		preferences.save_directory || "~/Pictures/Webcam",
	);
	await fs.mkdir(saveDirectory, { recursive: true });

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const outputPath = path.join(saveDirectory, `webcam-${timestamp}.jpg`);

	await execFileAsync("ffmpeg", [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"v4l2",
		...resolutionArgs(preferences.resolution),
		"-i",
		device.path,
		"-ss",
		"00:00:01",
		"-frames:v",
		"1",
		outputPath,
	]);

	if (preferences.copy_to_clipboard) {
		await Clipboard.copy({ file: outputPath });
	}
	if (preferences.open_after_capture) {
		await open(outputPath);
	}

	return outputPath;
}

function expandHome(inputPath: string): string {
	if (inputPath === "~") return os.homedir();
	if (inputPath.startsWith("~/"))
		return path.join(os.homedir(), inputPath.slice(2));
	return inputPath;
}

export function showSuccess(title: string, message?: string) {
	showToast({
		style: Toast.Style.Success,
		title,
		...(message && { message }),
	});
}

export function handleError(title: string, error: unknown) {
	showToast({
		style: Toast.Style.Failure,
		title,
		message: error instanceof Error ? error.message : "Unknown error",
	});
}
