import { execFile } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Clipboard } from "@vicinae/api";
import { redactSecrets } from "./api";
import type { ScreenContext } from "./types";

const execFileAsync = promisify(execFile);
const PRECAPTURED_MAX_AGE_MS = 10_000;
const CONTEXT_CMD_TIMEOUT_MS = 5_000;

function getRuntimeContextPath(): string | null {
	const runtimeDir = process.env.XDG_RUNTIME_DIR;
	return runtimeDir ? join(runtimeDir, "omafind-screen-context.json") : null;
}

function consumePreCapturedContext(): ScreenContext | null {
	const path = getRuntimeContextPath();
	if (!path || !existsSync(path)) return null;

	try {
		const raw = readFileSync(path, "utf8");
		unlinkSync(path);
		const parsed = JSON.parse(raw) as ScreenContext;
		if (
			typeof parsed.capturedAt === "number" &&
			Date.now() - parsed.capturedAt <= PRECAPTURED_MAX_AGE_MS
		) {
			return parsed;
		}
	} catch {
		// Ignore stale/invalid runtime snapshot
	}
	return null;
}

export async function captureScreenContext(): Promise<ScreenContext> {
	const precaptured = consumePreCapturedContext();
	if (precaptured) return precaptured;

	// If launched from inside Vicinae without pre-capture, query `omafind context --behind-vicinae`.
	try {
		const { stdout } = await execFileAsync(
			"omafind",
			["context", "--behind-vicinae", "--json"],
			{ timeout: CONTEXT_CMD_TIMEOUT_MS },
		);
		return JSON.parse(stdout) as ScreenContext;
	} catch {
		// Fallback when `omafind` CLI isn't installed (e.g. standalone Vicinae Store install)
		const clipboardText = await Clipboard.readText().catch(() => undefined);
		const selection = clipboardText?.trim()
			? redactSecrets(clipboardText.trim().slice(0, 2000))
			: undefined;

		return {
			blocked: false,
			selection,
			capturedAt: Date.now(),
		};
	}
}
