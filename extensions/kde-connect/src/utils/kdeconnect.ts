import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PopToRootType, closeMainWindow, popToRoot } from "@vicinae/api";

const execFileAsync = promisify(execFile);

/**
 * Resets navigation stack to root and closes the Vicinae window immediately.
 * Ensures that reopening Vicinae lands cleanly on the search screen rather than
 * restoring a suspended command view.
 */
export async function finishAndClose(): Promise<void> {
	try {
		await popToRoot({ clearSearchBar: true });
	} catch {
		// Ignore any error if already at root
	}
	await closeMainWindow({
		popToRootType: PopToRootType.Immediate,
		clearRootSearch: true,
	});
}

export interface KdeDevice {
	id: string;
	name: string;
}

/**
 * Fetches the list of reachable paired devices using `kdeconnect-cli -a`.
 * Strictly filters only devices that are confirmed to be BOTH paired AND reachable.
 */
export async function getAvailableDevices(): Promise<KdeDevice[]> {
	try {
		const { stdout } = await execFileAsync("kdeconnect-cli", ["-a"]);
		const lines = stdout.split("\n");
		const devices: KdeDevice[] = [];
		const regex =
			/^-\s+(.+?):\s+([a-zA-Z0-9_-]+)(?:\s+.*)?\s+\(paired and reachable\)$/;

		for (const line of lines) {
			const match = regex.exec(line.trim());
			if (match) {
				devices.push({
					name: match[1].trim(),
					id: match[2].trim(),
				});
			}
		}

		return devices;
	} catch (error) {
		console.error("Error fetching KDE Connect devices:", error);
		return [];
	}
}

/**
 * Sends one or multiple files to a device using `kdeconnect-cli -d <device> --share <file>`.
 */
export async function sendFiles(
	deviceId: string,
	filePaths: string[],
	onProgress?: (current: number, total: number, currentFile: string) => void,
): Promise<void> {
	if (!filePaths || filePaths.length === 0) {
		throw new Error("No files selected to send.");
	}

	for (let i = 0; i < filePaths.length; i++) {
		const filePath = filePaths[i];
		onProgress?.(i + 1, filePaths.length, filePath);
		await execFileAsync("kdeconnect-cli", [
			"-d",
			deviceId,
			"--share",
			filePath,
		]);
	}
}
export const shareFiles = sendFiles;

/**
 * Sends text directly to a device using `kdeconnect-cli -d <device> --share-text <text>`.
 */
export async function sendText(deviceId: string, text: string): Promise<void> {
	if (!text || !text.trim()) {
		throw new Error("Text cannot be empty.");
	}
	await execFileAsync("kdeconnect-cli", [
		"-d",
		deviceId,
		"--share-text",
		text.trim(),
	]);
}
export const shareText = sendText;

/**
 * Sends the current clipboard content to the device.
 */
export async function sendClipboard(deviceId?: string): Promise<void> {
	const args = deviceId
		? ["-d", deviceId, "--send-clipboard"]
		: ["--send-clipboard"];
	await execFileAsync("kdeconnect-cli", args);
}

/**
 * Rings the device to help find it.
 */
export async function ringPhone(deviceId?: string): Promise<void> {
	const args = deviceId ? ["-d", deviceId, "--ring"] : ["--ring"];
	await execFileAsync("kdeconnect-cli", args);
}

/**
 * Sends an SMS message to a destination phone number.
 */
export async function sendMessage(
	deviceId: string,
	destination: string,
	message: string,
): Promise<void> {
	if (!destination.trim()) {
		throw new Error("Phone number is required.");
	}
	if (!message.trim()) {
		throw new Error("Message text is required.");
	}

	await execFileAsync("kdeconnect-cli", [
		"-d",
		deviceId,
		"--destination",
		destination.trim(),
		"--send-sms",
		message.trim(),
	]);
}
