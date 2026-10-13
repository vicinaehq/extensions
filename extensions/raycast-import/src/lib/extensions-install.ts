// Shared Raycast-extension self-installer loop.
// Replicates Vicinae's native installFromZip: fetch the official Raycast store
// backend (no auth) -> download_url -> zip -> pure-JS stripComponents=1 extract
// into a staging dir -> atomic rename into <extensionsDir>/store.raycast.<name>/
// -> the app's registry (QFileSystemWatcher -> scanAll) live-registers it, no
// restart. Already-installed dirs are skipped (idempotent).
// No child processes, no downloaded executables are run — only JS bundles are
// unzipped and laid down for the app to load. See references/raycast-store-install.md.

import { join, dirname } from "node:path";
import { existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { extractZip } from "./unzip";
import { extensionsDir } from "./raycast";

export interface ExtensionPick {
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

export type InstallOutcome = { status: "installed" | "skipped" | "error"; detail: string };

export async function installExtension(ext: ExtensionPick, extDir: string): Promise<InstallOutcome> {
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

export interface InstallReport {
	installed: number;
	skipped: number;
	failures: { name: string; error: string }[];
}

/** Install a list of picked extensions sequentially. Never throws; individual
 *  failures are collected. `onProgress` (if given) receives (done, total,
 *  installed, skipped, failed) after each extension. */
export async function installExtensions(
	picks: ExtensionPick[],
	onProgress?: (done: number, total: number, installed: number, skipped: number, failed: number) => void,
): Promise<InstallReport> {
	const extDir = extensionsDir();
	mkdirSync(extDir, { recursive: true });
	const total = picks.length;
	let installed = 0;
	let skipped = 0;
	const failures: { name: string; error: string }[] = [];

	for (let i = 0; i < picks.length; i++) {
		const ext = picks[i];
		try {
			const res = await installExtension(ext, extDir);
			if (res.status === "installed") installed++;
			else if (res.status === "skipped") skipped++;
		} catch (err) {
			failures.push({
				name: ext.name,
				error: err instanceof Error ? err.message : String(err),
			});
		}
		if (onProgress) onProgress(i + 1, total, installed, skipped, failures.length);
		if (i < picks.length - 1) await sleep(200);
	}
	return { installed, skipped, failures };
}
