import { execFile } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { BrowserExtension, Clipboard, environment } from "@vicinae/api";
import { redactSecrets } from "./api";
import type { BrowserTabInfo, ScreenContext } from "./types";

const execFileAsync = promisify(execFile);
const PRECAPTURED_MAX_AGE_MS = 10_000;
const CONTEXT_CMD_TIMEOUT_MS = 8_000;

const BROWSER_CLASS_RE =
	/(chromium|chrome|firefox|brave|zen|vivaldi|helium|edge|opera)/i;
const SENSITIVE_URL_RE = /(chrome:\/\/settings|about:config|1password|bitwarden)/i;

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

async function fetchActiveBrowserTab(
	ctx: ScreenContext,
): Promise<BrowserTabInfo | undefined> {
	if (ctx.blocked) return undefined;
	if (!environment.canAccess(BrowserExtension)) return undefined;

	const windowClass = ctx.window?.className ?? "";
	if (windowClass && !BROWSER_CLASS_RE.test(windowClass)) return undefined;

	try {
		const tabs = await BrowserExtension.getTabs();
		const active =
			tabs.find((t) => t.active) ??
			[...tabs].sort((a, b) => b.lastAccessed - a.lastAccessed)[0];
		if (!active || !active.url || SENSITIVE_URL_RE.test(active.url)) {
			return undefined;
		}
		return {
			title: active.title?.trim() || undefined,
			url: redactSecrets(active.url),
		};
	} catch {
		return undefined;
	}
}

export async function captureScreenContext(): Promise<ScreenContext> {
	let ctx = consumePreCapturedContext();

	if (!ctx) {
		try {
			const { stdout } = await execFileAsync(
				"omafind",
				["context", "--behind-vicinae", "--json"],
				{ timeout: CONTEXT_CMD_TIMEOUT_MS },
			);
			ctx = JSON.parse(stdout) as ScreenContext;
		} catch {
			const clipboardText = await Clipboard.readText().catch(() => undefined);
			const clipboard = clipboardText?.trim()
				? redactSecrets(clipboardText.trim().slice(0, 2000))
				: undefined;
			ctx = {
				blocked: false,
				clipboard,
				capturedAt: Date.now(),
			};
		}
	}

	if (!ctx.blocked && !ctx.activeTab) {
		const activeTab = await fetchActiveBrowserTab(ctx);
		if (activeTab) {
			ctx = { ...ctx, activeTab };
		}
	}

	return ctx;
}
