import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { ActiveMirrorSession, Output, ScreenMirrorProps } from "./types";

export const execAsync = promisify(exec);

const ACTIVE_MIRROR_STORAGE_KEY = "screen_mirror_active_session";

export async function isWlrRandrInstalled(): Promise<boolean> {
	try {
		await execAsync("which wlr-randr");
		return true;
	} catch {
		return false;
	}
}

export async function isWlMirrorInstalled(): Promise<boolean> {
	try {
		await execAsync("which wl-mirror");
		return true;
	} catch {
		return false;
	}
}

export async function getDisplayOutputs(): Promise<Output[]> {
	const { stdout } = await execAsync("wlr-randr --json");
	const parsed = JSON.parse(stdout);
	if (!Array.isArray(parsed)) {
		throw new Error("Invalid output format from wlr-randr");
	}
	return parsed as Output[];
}

export async function isPidRunning(pid: number): Promise<boolean> {
	try {
		process.kill(pid, 0);
		const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
		return stdout.trim().includes("wl-mirror");
	} catch {
		return false;
	}
}

export async function getActiveMirrorSession(): Promise<ActiveMirrorSession | null> {
	try {
		const raw = await LocalStorage.getItem<string>(ACTIVE_MIRROR_STORAGE_KEY);
		if (!raw) return null;
		const session: ActiveMirrorSession = JSON.parse(raw);
		if (session.pid && (await isPidRunning(session.pid))) {
			return session;
		}
		await LocalStorage.removeItem(ACTIVE_MIRROR_STORAGE_KEY);
		return null;
	} catch {
		return null;
	}
}

export async function startScreenMirror({
	source,
	target,
	setActiveMirror,
}: ScreenMirrorProps): Promise<boolean> {
	let child: ReturnType<typeof spawn> | null = null;
	try {
		const activeSession = await getActiveMirrorSession();
		if (activeSession) {
			return await cancelScreenMirror(setActiveMirror);
		}

		if (!source || !target) {
			showToast({
				style: Toast.Style.Failure,
				title: "Source and target monitors are required.",
			});
			return false;
		}

		if (source === target) {
			showToast({
				style: Toast.Style.Failure,
				title: "Source and destination cannot be the same.",
			});
			return false;
		}

		child = spawn(
			"wl-mirror",
			["--fullscreen-output", target, "--fullscreen", source],
			{
				stdio: "ignore",
				detached: true,
			},
		);

		if (!child.pid) {
			throw new Error("Failed to spawn wl-mirror process.");
		}

		child.unref();

		const session: ActiveMirrorSession = {
			pid: child.pid,
			source,
			target,
		};

		await LocalStorage.setItem(
			ACTIVE_MIRROR_STORAGE_KEY,
			JSON.stringify(session),
		);
		setActiveMirror?.(session);
		showSuccess("Screen mirroring started successfully.");
		return true;
	} catch (error) {
		if (child?.pid) {
			try {
				process.kill(child.pid, "SIGTERM");
			} catch {
				// Process already exited
			}
		}
		handleError("Failed to start screen mirroring.", error);
		setActiveMirror?.(null);
		return false;
	}
}

export async function cancelScreenMirror(
	setActiveMirror?: (session: ActiveMirrorSession | null) => void,
): Promise<boolean> {
	try {
		const session = await getActiveMirrorSession();
		if (!session) {
			setActiveMirror?.(null);
			await LocalStorage.removeItem(ACTIVE_MIRROR_STORAGE_KEY);
			return true;
		}

		if (session.pid) {
			try {
				process.kill(session.pid, "SIGTERM");
			} catch {
				// Process already exited
			}
		}

		await LocalStorage.removeItem(ACTIVE_MIRROR_STORAGE_KEY);
		showSuccess("Screen mirroring stopped successfully.");
		setActiveMirror?.(null);
		return true;
	} catch (error) {
		handleError("Failed to stop screen mirroring.", error);
		return false;
	}
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
