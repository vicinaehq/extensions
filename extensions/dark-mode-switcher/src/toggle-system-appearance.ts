import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { showHUD } from "@vicinae/api";

const run = promisify(execFile);
const interfaceSchema = "org.gnome.desktop.interface";

async function toggleAppearance(): Promise<string> {
	switch (process.platform) {
		case "darwin": {
			await run("osascript", [
				"-e",
				'tell app "System Events" to tell appearance preferences to set dark mode to not dark mode',
			]);
			return "System appearance toggled";
		}
		case "linux": {
			const { stdout } = await run("gsettings", [
				"get",
				interfaceSchema,
				"color-scheme",
			]);
			const darkMode = stdout.trim() === "'prefer-dark'";
			await run("gsettings", [
				"set",
				interfaceSchema,
				"color-scheme",
				darkMode ? "default" : "prefer-dark",
			]);
			return darkMode ? "Light mode enabled" : "Dark mode enabled";
		}
		default:
			throw new Error(`Unsupported platform: ${process.platform}`);
	}
}

export default async function ToggleSystemAppearance() {
	try {
		await showHUD(await toggleAppearance());
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		console.error("Unable to toggle system appearance:", error);
		await showHUD(`Unable to toggle appearance: ${detail}`);
	}
}
