import { exec } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { closeMainWindow, showHUD } from "@vicinae/api";
import { TEMP_PATH, getSavePath } from "./filesystem";
import { getPrefs, isNativeHandoff } from "./preferences";
import { getBackend } from "../backends";
import { isCancellation } from "../backends/errors";
import { stderrOf } from "../backends/utils";
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

	// Native hand-off writes straight to the save directory: the desktop tool's
	// notification then refers to a file that persists, instead of a temporary
	// one the extension deletes.
	const native = isNativeHandoff();
	const target = native ? getSavePath(getPrefs()) : TEMP_PATH;
	if (native) mkdirSync(dirname(target), { recursive: true });
	// The native target is the user's own screenshot directory, and nothing
	// reserves the formatted filename there: a name the user has captured before
	// — certain with a filename_format that omits %S, and reachable on the
	// default one by shooting twice in the same second — already exists. Existence
	// alone would then hand back that old screenshot and report it as saved.
	const before = existsSync(target) ? statSync(target).mtimeMs : -1;

	try {
		if (!native && existsSync(TEMP_PATH)) unlinkSync(TEMP_PATH);
		await closeMainWindow();
		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay * 1000));
		}
		await backend.capture(mode, target, outputName, { notify: native });
		exec("vicinae open");
		// Some tools exit cleanly when the user dismisses the selector
		// (gnome-screenshot -a among them) and simply write nothing.
		if (!existsSync(target)) return null;
		return statSync(target).mtimeMs > before ? target : null;
	} catch (e) {
		exec("vicinae open");
		// Backends raise CaptureCancelled when the user backed out, and that is
		// the only outcome worth passing over in silence. Everything else — a
		// missing helper program, an unsupported compositor protocol, a tool that
		// produced nothing within its timeout — gets reported.
		if (isCancellation(e)) return null;
		const stderr = stderrOf(e);
		const detail = stderr.split("\n").pop() || (e as Error).message;
		showHUD(`${backend.displayName} failed: ${detail}`);
		return null;
	}
};
