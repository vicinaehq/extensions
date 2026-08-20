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
	} catch (e) {
		exec("vicinae open");
		// A cancellation (ESC in slurp/slop) exits non-zero, writes no file and
		// says nothing on stderr. Anything else is a real failure worth reporting.
		const stderr = String(
			(e as { stderr?: Buffer | string }).stderr ?? "",
		).trim();
		if (existsSync(TEMP_PATH) || stderr !== "") {
			const detail = stderr.split("\n").pop() || (e as Error).message;
			showHUD(`${backend.displayName} failed: ${detail}`);
		}
		return null;
	}
};
