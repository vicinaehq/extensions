import { join, dirname } from "node:path";
import { readFileSync, existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { Toast, showToast, LaunchType, type LaunchProps } from "@vicinae/api";
import { extractZip } from "./lib/unzip";
import { extensionsDir } from "./lib/raycast";

// ---- Headless installer for Raycast extensions ----
// Reads the picked [{name, author}] list from a 0600 temp JSON (path passed via
// launchContext.file), then for each extension:
//   1. GET https://backend.raycast.com/api/v1/extensions/<author>/<name>  -> metadata
//   2. download `download_url` (signed S3, ~24h validity) -> zip bytes
//   3. extract with stripComponents=1 (Raycast store zips have a single top folder
//      containing package.json at its root — same layout Vicinae's own installer
//      expects after unzip), into <extensionsDir>/.staging-store.raycast.<name>
//   4. atomic rename to <extensionsDir>/store.raycast.<name>
// The app's extension registry watches the extensions dir (QFileSystemWatcher →
//   100ms debounce → requestScan → scanAll) and live-registers the bundle — no
//   app restart needed (same mechanism as Vicinae's own store install).
// Already-installed dirs are skipped (idempotent re-runs).
//
// No child processes / no downloaded executables are run: we only unzip JS
// bundles with a pure-JS extractor and lay them down for the app to load.

interface Pick {
	name: string;
	author: string;
}

interface RaycastStoreExtension {
	name?: unknown;
	download_url?: unknown;
	platforms?: unknown;
	kill_listed_at?: unknown;
}

const API_BASE = "https://backend.raycast.com/api/v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function apiUrl(author: string, name: string): string {
	return `${API_BASE}/extensions/${encodeURIComponent(author)}/${encodeURIComponent(name)}`;
}

async function fetchJson(url: string): Promise<unknown> {
	const res = await fetch(url, { headers: { accept: "application/json" } });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return (await res.json()) as unknown;
}

async function fetchBuffer(url: string): Promise<Buffer> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const ab = await res.arrayBuffer();
	return Buffer.from(ab);
}

async function installOne(
	ext: Pick,
	extDir: string,
): Promise<{ status: "installed" | "skipped" | "error"; detail: string }> {
	const id = `store.raycast.${ext.name}`;
	const target = join(extDir, id);
	if (existsSync(target)) {
		return { status: "skipped", detail: `${id} already installed` };
	}

	// 1. fetch store metadata
	let meta: RaycastStoreExtension;
	try {
		meta = (await fetchJson(apiUrl(ext.author, ext.name))) as RaycastStoreExtension;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`fetch metadata ${ext.author}/${ext.name}: ${msg}`);
	}
	if (typeof meta.download_url !== "string" || !meta.download_url) {
		throw new Error(`${ext.author}/${ext.name}: no download_url in store response`);
	}

	// 2. download zip
	let zip: Buffer;
	try {
		zip = await fetchBuffer(meta.download_url);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`download ${ext.name}: ${msg}`);
	}

	// 3. extract into a staging dir (stripComponents=1), then 4. atomic rename.
	// Mirrors extension-registry installFromZip (staging -> rename -> emits
	// extensionAdded/extensionsChanged -> registry live-registers it).
	const staging = join(extDir, `.staging-${id}`);
	rmSync(staging, { recursive: true, force: true });
	mkdirSync(staging, { recursive: true });
	try {
		extractZip(zip, staging, { stripComponents: 1 });
	} catch (err) {
		rmSync(staging, { recursive: true, force: true });
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`extract ${ext.name}: ${msg}`);
	}

	// the bundle MUST contain a package.json at root (registry requirement)
	if (!existsSync(join(staging, "package.json"))) {
		rmSync(staging, { recursive: true, force: true });
		throw new Error(`${ext.name}: extracted bundle has no package.json — not a valid Raycast store zip?`);
	}

	rmSync(target, { recursive: true, force: true }); // protective (idempotent)
	renameSync(staging, target);
	return { status: "installed", detail: id };
}

export default async function Command(props: LaunchProps): Promise<void> {
	const file = props.launchContext?.file as string | undefined;

	if (!file) {
		await showToast({
			style: Toast.Style.Failure,
			title: "No install list",
			message:
				"This command runs automatically from 'Import Raycast Extensions' — use that command instead of launching this directly.",
		});
		return;
	}

	let picks: Pick[];
	try {
		const raw = readFileSync(file, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) throw new Error("payload is not an array");
		picks = parsed as Pick[];
	} catch (err) {
		rmSync(file, { force: true });
		await showToast({
			style: Toast.Style.Failure,
			title: "Invalid install list",
			message: err instanceof Error ? err.message : String(err),
		});
		return;
	}

	const extDir = extensionsDir();
	mkdirSync(extDir, { recursive: true });
	const total = picks.length;
	let installed = 0;
	let skipped = 0;
	const failures: { name: string; error: string }[] = [];

	const toast = await showToast({
		style: Toast.Style.Animated,
		title: "Installing extensions…",
		message: `0/${total} done`,
	});

	// sequential, ~1 fetch + 1 download per extension; keep rate modest so we
	// don't hammer the store or the app's registry rescan.
	for (let i = 0; i < picks.length; i++) {
		const ext = picks[i];
		try {
			const res = await installOne(ext, extDir);
			if (res.status === "installed") installed++;
			else skipped++;
		} catch (err) {
			failures.push({
				name: ext.name,
				error: err instanceof Error ? err.message : String(err),
			});
		}
		toast.message = `${i + 1}/${total} — ${installed} installed, ${skipped} skipped, ${failures.length} failed`;
		if (i < picks.length - 1) await sleep(200);
	}

	rmSync(file, { force: true }); // payload consumed — never leak pick list

	if (failures.length === 0) {
		toast.style = Toast.Style.Success;
		toast.title = "Extensions installed";
		toast.message = `${installed} installed${skipped ? `, ${skipped} already present` : ""}`;
	} else {
		toast.style = Toast.Style.Failure;
		toast.title = `Extension install finished with ${failures.length} failure${failures.length > 1 ? "s" : ""}`;
		toast.message = `${installed} installed, ${skipped} skipped. First failure: ${failures[0].name} — ${failures[0].error}`;
	}
}
