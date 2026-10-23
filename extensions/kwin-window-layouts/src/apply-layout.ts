import {
	WindowManagement,
	closeMainWindow,
	environment,
	showHUD,
} from "@vicinae/api";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Layout, LayoutId } from "./layouts";
import { layouts } from "./layouts";

const KWIN_SERVICE = "org.kde.KWin";
const SCRIPTING_PATH = "/Scripting";
const SCRIPTING_INTERFACE = "org.kde.kwin.Scripting";
const SCRIPT_INTERFACE = "org.kde.kwin.Script";
const WINDOW_ID =
	/^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i;

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function runProcess(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			command,
			args,
			{ encoding: "utf8", timeout: 4_000 },
			(error, stdout, stderr) => {
				if (error) {
					const detail = stderr.trim();
					reject(
						new Error(detail.length > 0 ? detail : error.message, {
							cause: error,
						}),
					);
					return;
				}
				resolve(stdout);
			},
		);
	});
}

async function getRestoredWindowId(): Promise<string> {
	let lastError: unknown;

	for (let attempt = 0; attempt < 12; attempt += 1) {
		try {
			const window = await WindowManagement.getActiveWindow();
			if (WINDOW_ID.test(window.id)) {
				return window.id;
			}
		} catch (error) {
			lastError = error;
		}

		await delay(50);
	}

	// The tracker can lose its state after a restart. Fall back once, after
	// allowing it to recover, rather than spawning a process on every retry.
	try {
		const output = await runProcess("kdotool", [
			"getactivewindow",
			"getwindowid",
		]);
		const id = output.trim();
		if (WINDOW_ID.test(id)) {
			return id;
		}
	} catch (error) {
		lastError = error;
	}

	throw new Error("No focused window was found after closing Vicinae.", {
		cause: lastError,
	});
}

async function runKWinScript(targetId: string, layout: Layout): Promise<void> {
	const temporaryDirectory = await mkdtemp(
		join(tmpdir(), "kwin-window-layouts-"),
	);
	const scriptPath = join(temporaryDirectory, "apply-layout.js");
	const pluginName = `kwin-window-layouts-${process.pid}-${Date.now()}`;
	let wasLoaded = false;

	try {
		const template = await readFile(
			join(environment.assetsPath, "apply-layout.js"),
			"utf8",
		);
		const source = template
			.replace("__TARGET_ID__", JSON.stringify(targetId))
			.replace("__LAYOUT__", JSON.stringify(layout));

		await writeFile(scriptPath, source, { encoding: "utf8", mode: 0o600 });

		const loadOutput = await runProcess("gdbus", [
			"call",
			"--session",
			"--dest",
			KWIN_SERVICE,
			"--object-path",
			SCRIPTING_PATH,
			"--method",
			`${SCRIPTING_INTERFACE}.loadScript`,
			scriptPath,
			pluginName,
		]);
		const scriptNumber = loadOutput.match(/\((-?\d+),?\)/)?.[1];

		if (scriptNumber === undefined || Number(scriptNumber) < 0) {
			throw new Error("KWin rejected the window layout script.");
		}
		wasLoaded = true;

		await runProcess("gdbus", [
			"call",
			"--session",
			"--dest",
			KWIN_SERVICE,
			"--object-path",
			`/Scripting/Script${scriptNumber}`,
			"--method",
			`${SCRIPT_INTERFACE}.run`,
		]);

		// KWin replies successfully even when evaluation throws, but unloads
		// the failed script. A successful one-shot script remains loaded.
		const loaded = await runProcess("gdbus", [
			"call",
			"--session",
			"--dest",
			KWIN_SERVICE,
			"--object-path",
			SCRIPTING_PATH,
			"--method",
			`${SCRIPTING_INTERFACE}.isScriptLoaded`,
			pluginName,
		]);
		if (loaded.trim() !== "(true,)") {
			throw new Error(
				"KWin could not apply the layout. The window may have closed. Try again with a resizable application window.",
			);
		}
	} finally {
		if (wasLoaded) {
			await runProcess("gdbus", [
				"call",
				"--session",
				"--dest",
				KWIN_SERVICE,
				"--object-path",
				SCRIPTING_PATH,
				"--method",
				`${SCRIPTING_INTERFACE}.unloadScript`,
				pluginName,
			]).catch((error: unknown) => {
				console.error("Could not unload the temporary KWin script", error);
			});
		}
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

function userFacingError(error: unknown): string {
	if (!(error instanceof Error)) {
		return "An unexpected error occurred.";
	}

	for (
		let cause: unknown = error;
		cause instanceof Error;
		cause = cause.cause
	) {
		if ("code" in cause && cause.code === "ENOENT" && "path" in cause) {
			if (cause.path === "kdotool") {
				return "Vicinae could not identify the focused window. Install kdotool for the KWin fallback.";
			}
			if (cause.path === "gdbus") {
				return "gdbus is required. Install GLib and try again.";
			}
		}
		if (cause.message.includes("org.freedesktop.DBus.Error.ServiceUnknown")) {
			return "KDE Plasma with KWin is required.";
		}
	}

	return error.message;
}

export async function applyLayout(id: LayoutId): Promise<void> {
	try {
		if (process.platform !== "linux") {
			throw new Error("This extension currently supports Linux only.");
		}

		await closeMainWindow({ clearRootSearch: true });
		await delay(150);

		const targetId = await getRestoredWindowId();
		await runKWinScript(targetId, layouts[id]);
	} catch (error) {
		console.error(`Could not apply layout ${id}`, error);
		await showHUD(`Window layout failed: ${userFacingError(error)}`).catch(
			() => undefined,
		);
	}
}

export function commandFor(id: LayoutId): () => Promise<void> {
	return () => applyLayout(id);
}
