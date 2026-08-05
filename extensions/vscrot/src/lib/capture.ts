import { exec } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { closeMainWindow, showHUD } from "@vicinae/api";
import { TEMP_PATH } from "./filesystem";
import { getBackend } from "../backends";
import type { CaptureMode } from "../backends/types";

export const captureScreenshot = async (
	mode: CaptureMode,
	toolId: string,
	delay = 0,
	outputName?: string,
): Promise<string | null> => {
	const backend = getBackend(toolId);

	if (!backend) {
		showHUD(
			`No screenshot tool found (configured: ${toolId}). Install one and retry.`,
		);
		return null;
	}

	if (!backend.supportedModes.includes(mode)) {
		showHUD(`${backend.displayName} does not support "${mode}" capture`);
		return null;
	}

	try {
		if (existsSync(TEMP_PATH)) unlinkSync(TEMP_PATH);
		await closeMainWindow();
		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay * 1000));
		}
		await backend.capture(mode, TEMP_PATH, outputName);
		exec("vicinae open");
		return TEMP_PATH;
	} catch {
		// User cancelled selection (e.g. ESC in slurp) or tool error - surface nothing
		exec("vicinae open");
		return null;
	}
};
