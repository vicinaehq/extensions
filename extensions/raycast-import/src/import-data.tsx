import { homedir, tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import {
	readFileSync,
	writeFileSync,
	renameSync,
	existsSync,
	mkdirSync,
	rmSync,
} from "node:fs";
import { createDecipheriv, scryptSync, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { useState } from "react";
import {
	Action,
	ActionPanel,
	Clipboard,
	Form,
	Icon,
	List,
	Toast,
	launchCommand,
	LaunchType,
	showToast,
	useNavigation,
} from "@vicinae/api";

// ---- Vicinae snippet storage (verified against upstream src/snippet + glaze v7) ----
//   { id, name, data: { "text": "..." } | { "file": "..." }, createdAt, updatedAt?, expansion? }
// File lives at <dataDir>/snippets/snippets.json on every platform.
// NOTE (verified in code): the running server caches snippets in memory and rewrites on
// mutation — no file watcher. Restart the app after import; don't edit snippets first.

// ---- Raycast .rayconfig formats (reverse-engineered by Tinycast, verified live here) ----
// v1 (Raycast 1.x):   file = IV(16) || AES-256-CBC( gzip(JSON), PKCS#7 ), key = SHA-256(passphrase)
// v2 (schemaVersion 3, RAYCFG3): "RAYCFG3\n" + u32le gzipLen + gzip(envelope JSON
//                      {exportedAt, appVersion, encryption:{iv,salt}, schemaVersion}) +
//                      AES-256-GCM payload (16B tag appended). Key = scrypt(passphrase,
//                      salt, N=16384, r=8, p=1, dkLen=32). GCM plaintext = gzip of big JSON.
// Detection: leading "RAYC\0" magic => RAYCFG3 v2; leading gzip magic (1f 8b 08) => legacy v2
//            envelope; else v1 (whole AES blocks).
// Data lives at root.snippets.snippets (v2, {title, rawContent}) / root.quicklinks.quicklinks /
// root.clipboardHistory.clipboardEntries (v2, items[].representations[].content) etc.

interface VicinaeSnippet {
	id: string;
	name: string;
	data: { text?: string; file?: string };
	createdAt: number;
	updatedAt?: number;
	expansion?: { keyword: string; apps: string[]; word: boolean };
}

interface RaycastSnippet {
	name?: unknown;
	text?: unknown;
	keyword?: unknown;
	alias?: unknown;
}

// ---- Raycast decryption (pure port of Tinycast's reverse-engineered format) ----

type DecryptResult =
	| { ok: true; data: unknown }
	| { ok: false; error: "notRaycast" | "passphrase" | "corrupt" };

function decryptV1(raw: Buffer, passphrase: string): DecryptResult {
	try {
		if (raw.length < 32 || raw.length % 16 !== 0)
			return { ok: false, error: "notRaycast" };
		const iv = raw.subarray(0, 16);
		const ct = raw.subarray(16);
		const key = createHash_le("sha256", passphrase);
		const decipher = createDecipheriv("aes-256-cbc", key, iv);
		decipher.setAutoPadding(false); // Node auto-unpads by default; we unpad ourselves (tinycast-compatible)
		// Node 22 renamed finalize -> final; @types/node has both. Call whichever exists.
		const finish: () => Buffer = decipher.final
			? () => decipher.final()
			: () => (decipher as unknown as { finalize: () => Buffer }).finalize();
		let pt = Buffer.concat([decipher.update(ct), finish()]);
		// strip PKCS#7
		const pad = pt[pt.length - 1];
		if (pad < 1 || pad > 16 || pad > pt.length) return { ok: false, error: "passphrase" };
		pt = pt.subarray(0, pt.length - pad);
		// integrity: must gunzip into JSON
		return parseVicinaeJson(gunzipSync(pt));
	} catch {
		return { ok: false, error: "passphrase" };
	}
}

function decryptV2(
	raw: Buffer,
	passphrase: string,
	isRaycfg3: boolean,
): DecryptResult {
	try {
		// Real v2 (schemaVersion 3, Tinycast-compatible):
		//   "RAYCFG3\n" (8B) + u32 little-endian gzipLen + gzip(envelope JSON
		//   {exportedAt, appVersion, encryption:{iv, salt}, schemaVersion:3})
		//   + AES-256-GCM payload (16B auth tag appended to ciphertext).
		//   Key = scrypt(passphrase, salt, 32, N=16384, r=8, p=1).
		//   GCM plaintext = another gzip stream of the big JSON export.
		if (isRaycfg3) {
			if (raw.length < 12) return { ok: false, error: "corrupt" };
			const envLen = raw.readUInt32LE(8);
			if (envLen <= 0 || 12 + envLen > raw.length)
				return { ok: false, error: "corrupt" };
			const envRaw = gunzipSync(raw.subarray(12, 12 + envLen));
			const env = JSON.parse(envRaw.toString("utf8")) as Record<string, unknown>;
			const enc = env["encryption"] as Record<string, string> | undefined;
			if (!enc || typeof enc["iv"] !== "string" || typeof enc["salt"] !== "string")
				return { ok: false, error: "notRaycast" };
			const iv = Buffer.from(enc["iv"], "hex");
			const salt = Buffer.from(enc["salt"], "hex");
			const payload = raw.subarray(12 + envLen);
			if (payload.length <= 16) return { ok: false, error: "corrupt" };
			const tag = payload.subarray(payload.length - 16);
			const ct = payload.subarray(0, payload.length - 16);
			const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
			const decipher = createDecipheriv("aes-256-gcm", key, iv);
			decipher.setAuthTag(tag);
			const finish: () => Buffer = decipher.final
				? () => decipher.final()
				: () => (decipher as unknown as { finalize: () => Buffer }).finalize();
			const plain = Buffer.concat([decipher.update(ct), finish()]);
			return parseVicinaeJson(gunzipSync(plain));
		}

		// legacy v2: gzip -> JSON envelope {data, encryption:{iv,salt,authTag}} -> AES-256-GCM
		let env: Record<string, unknown>;
		try {
			env = JSON.parse(gunzipSync(raw).toString("utf8")) as Record<string, unknown>;
		} catch {
			return { ok: false, error: "notRaycast" };
		}
		const dataHex = env["data"];
		const enc = env["encryption"] as Record<string, string> | undefined;
		if (typeof dataHex !== "string" || !enc) return { ok: false, error: "notRaycast" };
		const iv = Buffer.from(enc["iv"] ?? "", "hex");
		const salt = Buffer.from(enc["salt"] ?? "", "hex");
		const tag = Buffer.from(enc["authTag"] ?? "", "hex");
		const ciphertext = Buffer.from(dataHex, "hex");
		const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
		const decipher = createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(tag);
		const finish: () => Buffer = decipher.final
			? () => decipher.final()
			: () => (decipher as unknown as { finalize: () => Buffer }).finalize();
		const plain = Buffer.concat([decipher.update(ciphertext), finish()]);
		return parseVicinaeJson(gunzipSync(plain));
	} catch {
		return { ok: false, error: "passphrase" };
	}
}

// tiny local sha256 for v1 (matches EVP_BytesToKey single round => SHA-256(passphrase))
function createHash_le(algo: "sha256", data: string): Buffer {
	return createHash(algo).update(data, "utf8").digest();
}

function parseVicinaeJson(plain: Buffer): DecryptResult {
	try {
		return { ok: true, data: JSON.parse(plain.toString("utf8")) };
	} catch {
		return { ok: false, error: "corrupt" };
	}
}

type RaycastEmoji = { symbol?: unknown; customKeywords?: unknown; frecencyDate?: unknown };

function findSnippetsInExport(
	root: unknown,
): { name: string; text: string; keyword?: string }[] {
	const out: { name: string; text: string; keyword?: string }[] = [];
	// plain "Export Snippets" JSON is a top-level array
	if (Array.isArray(root)) {
		for (const item of root) {
			const e = (item ?? {}) as Record<string, unknown>;
			const name = (e["name"] ?? "").toString().trim();
			const text = (e["text"] ?? "").toString();
			if (!name || !text) continue;
			const keyword = (e["keyword"] ?? e["alias"] ?? "").toString().trim();
			out.push({ name, text, keyword: keyword || undefined });
		}
		return out;
	}
	const obj = (root ?? {}) as Record<string, unknown>;
	const pkgs = obj["builtin_package_snippets"] as Record<string, unknown> | undefined;
	const v1Raw = (typeof pkgs === "object" && pkgs && (pkgs["snippets"] as unknown[] | undefined)) || [];
	const v2Raw = (obj["snippets"] as Record<string, unknown> | undefined)?.["snippets"] as
		| unknown[]
		| undefined;
	const raw = (v2Raw ?? v1Raw) as unknown[];
	for (const item of raw) {
		const e = (item ?? {}) as Record<string, unknown>;
		// v1: { name, text, alias }; v2: { title, text/rawContent, tags }
		const name = (e["name"] ?? e["title"] ?? "").toString().trim();
		if (!name) continue;
		// v2 rich text lives in rawContent.content[n].content[m].text — fall back to .text
		let text = (e["text"] ?? "").toString();
		if (!text) text = extractRichText(e["rawContent"]);
		if (!text) continue;
		const keyword = (e["keyword"] ?? e["alias"] ?? "").toString().trim();
		out.push({ name, text, keyword: keyword || undefined });
	}
	return out;
}

// Tinycast/Raycast rich-text doc: rawContent.content[] -> content[] -> { text }
function extractRichText(raw: unknown): string {
	if (!raw || typeof raw !== "object") return "";
	const parts: string[] = [];
	const walk = (node: Record<string, unknown> | unknown[], depth: number) => {
		if (depth > 16) return;
		if (Array.isArray(node)) {
			for (const el of node) if (el && typeof el === "object") walk(el as Record<string, unknown>, depth + 1);
			return;
		}
		const n = node as Record<string, unknown>;
		if (typeof n["text"] === "string") parts.push(n["text"] as string);
		const content = n["content"];
		if (Array.isArray(content)) walk(content, depth + 1);
		else if (content && typeof content === "object") walk(content as Record<string, unknown>, depth + 1);
	};
	walk(raw as Record<string, unknown>, 0);
	return parts.join("\n");
}

function findClipboardInExport(root: unknown): {
	text: string;
	category: string;
	applicationPath?: string;
}[] {
	const obj = (root ?? {}) as Record<string, unknown>;
	const v1ch = obj["builtin_package_clipboardHistory"] as
		| { clipboardHistoryRecords?: unknown }
		| undefined;
	const v2ch = obj["clipboardHistory"] as
		| { clipboardEntries?: unknown }
		| undefined;
	const dots = root && typeof root === "object" && (root as { dots?: unknown }).dots;
	const out: { text: string; category: string; applicationPath?: string }[] = [];

	// v1 records: [{ text, category, applicationPath }]
	if (typeof v1ch === "object" && v1ch && v1ch.clipboardHistoryRecords) {
		for (const item of v1ch.clipboardHistoryRecords as unknown[]) {
			const e = (item ?? {}) as Record<string, unknown>;
			const text = (e["text"] ?? "").toString();
			if (!text) continue;
			const category = (e["category"] ?? "text").toString();
			const app = e["applicationPath"];
			out.push({
				text,
				category,
				...(typeof app === "string" && app ? { applicationPath: app } : {}),
			});
		}
		return out;
	}

	// v2 entries: [{ title, items: [{ representations: [{ content, contentType }] }], categories: [] }]
	const entries =
		(typeof v2ch === "object" && v2ch && v2ch.clipboardEntries) ||
		(typeof dots === "object" && (dots as { entries?: unknown }).entries &&
			(dots as { entries: unknown }).entries);
	for (const item of (entries as unknown[]) ?? []) {
		const e = (item ?? {}) as Record<string, unknown>;
		const items = Array.isArray(e["items"]) ? (e["items"] as Record<string, unknown>[]) : [];
		let text = "";
		let category = "text";
		for (const repGroup of items) {
			const reps = Array.isArray(repGroup["representations"])
				? (repGroup["representations"] as Record<string, unknown>[])
				: [];
			for (const r of reps) {
				const contentType = (r["contentType"] ?? "").toString();
				if (contentType && contentType !== "text") continue;
				const content = (r["content"] ?? "").toString();
				if (content) {
					text = content;
					if (contentType) category = contentType;
					break;
				}
			}
			if (text) break;
		}
		if (!text) text = (e["title"] ?? "").toString();
		if (!text) continue;
		category = Array.isArray(e["categories"]) && (e["categories"] as string[])[0]
			? (e["categories"] as string[])[0]
			: category;
		out.push({ text, category });
	}
	return out;
}

function findEmojiInExport(root: unknown): RaycastEmoji[] {
	const obj = (root ?? {}) as Record<string, unknown>;
	const pkg = obj["builtin_package_emoji"] as Record<string, unknown> | undefined;
	const v1Raw = (typeof pkg === "object" && pkg && (pkg["emojis"] as unknown[] | undefined)) || [];
	const v2Raw = (obj["emoji"] as Record<string, unknown> | undefined)?.["emojis"] as
		| unknown[]
		| undefined;
	return ((v2Raw ?? v1Raw) as unknown[]).map((item) => item as RaycastEmoji);
}

function readExportSnippets(file: string, passphrase: string): {
	snippets: { name: string; text: string; keyword?: string }[];
	clipboard: { text: string; category: string; applicationPath?: string }[];
	emoji: RaycastEmoji[];
} {
	const buf = readFileSync(file);
	const lower = file.toLowerCase();

	// plain JSON file (Raycast "Export Snippets") — unencrypted
	const isPlainJson =
		lower.endsWith(".json") ||
		!lower.endsWith(".rayconfig") && !(buf[0] === 0x1f && buf[1] === 0x8b);

	if (isPlainJson) {
		try {
			const parsed = JSON.parse(buf.toString("utf8"));
			const arr = Array.isArray(parsed)
				? parsed
				: (parsed as { snippets?: unknown }).snippets ?? [];
			return { snippets: findSnippetsInExport(arr), clipboard: [], emoji: [] };
		} catch {
			throw new Error("invalid-json");
		}
	}

	// encrypted .rayconfig
	if (
		(buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08) ||
		(buf[0] === 0x52 && buf[1] === 0x41 && buf[2] === 0x59 && buf[3] === 0x43) // "RAYC"
	) {
		// v2 — either legacy gz-json envelope or RAYCFG3 binary envelope
		const res = decryptV2(buf, passphrase, buf[0] === 0x52);
		if (!res.ok) throw new Error(res.error);
		return {
			snippets: findSnippetsInExport(res.data),
			clipboard: findClipboardInExport(res.data),
			emoji: findEmojiInExport(res.data),
		};
	}
	const res = decryptV1(buf, passphrase);
	if (!res.ok) throw new Error(res.error);
	return {
		snippets: findSnippetsInExport(res.data),
		clipboard: findClipboardInExport(res.data),
		emoji: findEmojiInExport(res.data),
	};
}

// ---- Vicinae emoji metadata store (GlyphService, verified) ----
// [{ emoji, visitCount, pinnedAt?, lastVisitedAt?, skinTone?, keyword? }]
interface VicinaeEmojiMeta {
	emoji: string;
	visitCount: number;
	lastVisitedAt?: number;
	keyword?: string;
}

function emojisPath(): string {
	return join(dataDir(), "emojis", "emojis.json");
}

// ---- Vicinae store helpers ----

function dataDir(): string {
	if (process.platform === "win32")
		return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "vicinae", "data");
	if (process.platform === "darwin") return join(homedir(), ".local", "share", "vicinae");
	const xdg = process.env.XDG_DATA_HOME;
	return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".local", "share"), "vicinae");
}

function snippetsPath(): string {
	return join(dataDir(), "snippets", "snippets.json");
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function toVicinaeSnippet(
	rc: { name: string; text: string; keyword?: string },
	at: number,
	existingNames: Set<string>,
	existingKeywords: Set<string>,
): { snippet: VicinaeSnippet | null; skippedReason?: string } {
	const name = (rc.name ?? "").trim();
	const text = (rc.text ?? "").trim();
	const keyword = (rc.keyword ?? "").trim() || undefined;
	if (!name) return { snippet: null, skippedReason: "missing name" };
	if (!text) return { snippet: null, skippedReason: "snippet is empty" };
	if (existingNames.has(name.toLowerCase()))
		return { snippet: null, skippedReason: "name already exists in Vicinae" };
	if (keyword && existingKeywords.has(keyword.toLowerCase()))
		return { snippet: null, skippedReason: "keyword already in use in Vicinae" };

	let id = `snp-${Math.random().toString(16).slice(2, 14)}`;
	// core format: snp- + 12 lowercase hex; pad in case RNG yields short strings
	while (id.length < 16) id += Math.floor(Math.random() * 16).toString(16);
	id = id.slice(0, 16);

	const snippet: VicinaeSnippet = {
		id,
		name,
		data: { text },
		createdAt: at,
		...((keyword ? { expansion: { keyword, apps: [] as string[], word: true } } : {}) as object),
	};
	if (keyword) snippet.updatedAt = at;

	existingNames.add(name.toLowerCase());
	if (keyword) existingKeywords.add(keyword.toLowerCase());
	return { snippet };
}

function readExisting(): VicinaeSnippet[] {
	const p = snippetsPath();
	if (!existsSync(p)) return [];
	try {
		const raw = JSON.parse(readFileSync(p, "utf8"));
		return Array.isArray(raw) ? (raw as VicinaeSnippet[]) : [];
	} catch {
		return [];
	}
}

// ---- Emoji metadata import (GlyphService store, verified) ----
// Raycast v2 emits [{ symbol, customKeywords[], frecencyDate }]. Vicinae stores
// per-glyph METADATA (the glyph table itself is static, generated into
// glyph.cpp): [{ emoji, visitCount, pinnedAt?, lastVisitedAt?, skinTone?, keyword? }].
// Safe merge: bump visitCount (frecency), set keyword (customKeywords joined),
// never clobber pinnedAt/skinTone. Atomic write with timestamp backup, like snippets.

function readExistingEmoji(): VicinaeEmojiMeta[] {
	const p = emojisPath();
	if (!existsSync(p)) return [];
	try {
		const raw = JSON.parse(readFileSync(p, "utf8"));
		return Array.isArray(raw) ? (raw as VicinaeEmojiMeta[]) : [];
	} catch {
		return [];
	}
}

function importEmojiMetadata(emojis: RaycastEmoji[]): number {
	if (emojis.length === 0) return 0;
	const existing = readExistingEmoji();
	const bySymbol = new Map(existing.map((e) => [e.emoji, e]));
	let merged = 0;
	const at = nowSeconds();
	for (const item of emojis) {
		const symbol = (item.symbol ?? "").toString().trim();
		if (!symbol) continue;
		const freq = Number(item.frecencyDate);
		const keywords = Array.isArray(item.customKeywords)
			? (item.customKeywords as unknown[])
					.map((k) => (k ?? "").toString().trim())
					.filter(Boolean)
			: [];
		let entry = bySymbol.get(symbol);
		if (entry) {
			// merge into existing metadata
			if (Number.isFinite(freq) && freq > 0) {
				entry.visitCount = Math.max(entry.visitCount ?? 0, Math.round(freq) || 1);
				entry.lastVisitedAt = at;
			}
			if (keywords.length > 0 && !entry.keyword)
				entry.keyword = keywords.join(" ");
		} else {
			entry = {
				emoji: symbol,
				visitCount: Number.isFinite(freq) && freq > 0 ? Math.round(freq) || 1 : 1,
				...(Number.isFinite(freq) && freq > 0 ? { lastVisitedAt: at } : {}),
				...(keywords.length > 0 ? { keyword: keywords.join(" ") } : {}),
			};
			bySymbol.set(symbol, entry);
			merged++;
		}
	}
	const all = [...bySymbol.values()];
	if (!existsSync(emojisPath())) mkdirSync(dirname(emojisPath()), { recursive: true });
	const b = `${emojisPath()}.bak-${nowSeconds()}`;
	if (existsSync(emojisPath())) renameSync(emojisPath(), b);
	const tmp = `${emojisPath()}.tmp-${nowSeconds()}`;
	writeFileSync(tmp, JSON.stringify(all, null, 2), "utf8");
	renameSync(tmp, emojisPath());
	return merged;
}

// ---- Clipboard history import ----
//
// Design (verified in host source): we do NOT write Vicinae's clipboard SQLite
// store directly. The extension's Clipboard.copy() RPC goes through
// ExtClipboardService::copy → ClipboardService::copyContent → macOS
// writeClipboard → the app's own poll() → selectionAdded → saveSelection, which
// dedupes by content hash (tryBubbleUpSelection) and inserts into the encrypted
// DB with the app's in-process key. So encryption is transparent and imported
// entries get built-in search indexing (fuzzy_trigram FTS) — exactly like
// copy-pasting each entry yourself.
//
// Pacing: the macOS clipboard server polls on a 500ms tick and only ONE pasteboard
// change is observed per tick. So we copy one entry every ~600ms — the import runs
// at ~1.7 entries/sec. ~4,900 text+link records ≈ 45-50 minutes.

type ClipboardRecord = { text: string; category: string; applicationPath?: string };

type ClipboardImportResult =
	| {
			status: "ok";
			imported: number;
			skippedDupes: number;
			skippedImagesFiles: number;
			skippedEmpty: number;
			errors: { byteLen: number; error: string }[];
	  }
	| { status: "no-records" };

const CLIPBOARD_COPY_INTERVAL_MS = 600;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function importClipboardHistory(records: ClipboardRecord[]): Promise<ClipboardImportResult> {
	if (records.length === 0) return { status: "no-records" };

	let imported = 0;
	let skippedDupes = 0;
	let skippedImagesFiles = 0;
	let skippedEmpty = 0;
	let clipboardErrors: { byteLen: number; error: string }[] | null = null;

	let toast: Toast | null = null;
	try {
		toast = await showToast({
			style: Toast.Style.Animated,
			title: "Importing clipboard history…",
			message: "0% — copying entries through Vicinae's recorder",
		});
	} catch {
		toast = null;
	}

	const total = records.length;
	let lastReport = Date.now();

	for (const r of records) {
		if (r.category !== "text" && r.category !== "link") {
			skippedImagesFiles++;
			continue;
		}
		const text = (r.text ?? "").toString();
		if (!text) {
			skippedEmpty++;
			continue;
		}
		// concealed=false (default): the copy is observed and recorded into history.
		// Re-copying identical text bubbles to the top instead of duplicating.
		// One failed copy must NEVER kill the whole import: catch per record,
		// remember the failure, keep streaming, report at the end.
		try {
			await Clipboard.copy(text);
			imported++;
		} catch (err) {
			if (!clipboardErrors) clipboardErrors = [];
			clipboardErrors.push({
				byteLen: Buffer.byteLength(text, "utf8"),
				error: err instanceof Error ? err.message : String(err),
			});
		}
		// one pasteboard change per poll tick (500ms) — leave margin
		await sleep(CLIPBOARD_COPY_INTERVAL_MS);

		// throttle toast updates to ~2/sec
		const now = Date.now();
		if (toast && now - lastReport > 500) {
			lastReport = now;
			const pct = Math.round((imported / total) * 100);
			toast.message = `${pct}% — ${imported}/${total} copied, ${clipboardErrors ? clipboardErrors.length : 0} failed (runs at ~1.7/sec)`;
		}
	}

	if (toast) {
		toast.style = Toast.Style.Success;
		toast.title = "Clipboard history imported";
		toast.message = `${imported} entries copied into Vicinae's history${
			clipboardErrors && clipboardErrors.length > 0 ? `, ${clipboardErrors.length} failed` : ""
		}.`;
	}

	return {
		status: "ok",
		imported,
		skippedDupes,
		skippedImagesFiles,
		skippedEmpty,
		errors: clipboardErrors ?? [],
	};
}

// ---- UI ----

function ImportForm() {
	const { push } = useNavigation();
	const [submitting, setSubmitting] = useState(false);

	async function onSubmit(input: Form.Values) {
		const file = Array.isArray(input.raycastFile)
			? input.raycastFile[0]
			: (input.raycastFile as string | undefined);
		const replace = Boolean(input.replaceExisting);
		const includeClipboard = Boolean(input.importClipboard);
		const passphrase = String(input.passphrase ?? "");

		setSubmitting(true);
		try {
			if (!file) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Pick a file",
					message:
						"Select the Raycast 'Export Snippets' JSON, or a .rayconfig backup (we'll decrypt it with your passphrase).",
				});
				return;
			}

			let entries: { name: string; text: string; keyword?: string }[];
			let clipboard: ClipboardRecord[];
			let emojis: RaycastEmoji[];
			try {
				const parsed = readExportSnippets(file, passphrase);
				entries = parsed.snippets;
				clipboard = parsed.clipboard;
				emojis = parsed.emoji;
			} catch (err) {
				// diagnostics: dump what the app actually delivered (no plaintext passphrase — length only)
				try {
					const diag = {
						when: new Date().toISOString(),
						file,
						fileSize:
							typeof file === "string" && existsSync(file) ? readFileSync(file).length : null,
						fileHead:
							typeof file === "string" && existsSync(file)
								? readFileSync(file).subarray(0, 8).toString("hex")
								: null,
						passphraseLen: passphrase.length,
						passphraseSha: createHash("sha256")
							.update("diag:" + passphrase)
							.digest("hex")
							.slice(0, 16),
						error: err instanceof Error ? err.message : String(err),
					};
					writeFileSync("/tmp/vicinae-import-diag.json", JSON.stringify(diag, null, 2));
				} catch {
					/* diagnostics must never break the flow */
				}
				const code = err instanceof Error ? err.message : "corrupt";
				const title =
					code === "notRaycast"
						? "Not a Raycast export"
						: code === "passphrase"
							? "Incorrect passphrase"
							: code === "invalid-json"
								? "Invalid JSON"
								: code === "corrupt"
									? "Corrupt export"
									: `Unexpected (${code})`;
				const message =
					code === "passphrase"
						? "The .rayconfig is encrypted. Enter the passphrase you set in Raycast → Settings → Extensions → Export Settings & Data."
						: code === "notRaycast"
							? "This doesn't look like a Raycast export. Use Export Snippets (plain .json) or Export Settings & Data (.rayconfig)."
							: `Pick a valid Raycast export: ${basename(file)} (${code})`;
				await showToast({ style: Toast.Style.Failure, title, message });
				return;
			}

			const at = nowSeconds();
			const existingNames = new Set<string>();
			const existingKeywords = new Set<string>();
			let existing: VicinaeSnippet[] = [];
			if (!replace) existing = readExisting();
			for (const e of existing) {
				existingNames.add((e.name ?? "").toLowerCase());
				if (e.expansion?.keyword)
					existingKeywords.add(e.expansion.keyword.toLowerCase());
			}

			const imported: VicinaeSnippet[] = [];
			const skipped: string[] = [];
			for (const e of entries) {
				const { snippet, skippedReason } = toVicinaeSnippet(
					e,
					at,
					existingNames,
					existingKeywords,
				);
				if (snippet) imported.push(snippet);
				else if (skippedReason) skipped.push(e.name ?? "?");
			}

			if (existsSync(snippetsPath())) {
				const b = `${snippetsPath()}.bak-${at}`;
				renameSync(snippetsPath(), b);
			}
			mkdirSync(dirname(snippetsPath()), { recursive: true });
			const all = [...existing, ...imported];
			const tmp = `${snippetsPath()}.tmp-${at}`;
			writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n", "utf8");
			renameSync(tmp, snippetsPath());

			// emoji metadata (frecency + custom keywords) — safe atomic merge
			const includeEmoji = Boolean(input.importEmoji);
			const emojiImported = includeEmoji ? importEmojiMetadata(emojis) : 0;

			// clipboard history (only meaningful for .rayconfig backups)
			// Runs in a HEADLESS no-view command (import-clipboard) so the loop
			// survives window dismissal — a view command's worker dies with its
			// CommandFrame (~CommandFrame → context->unload(), navigation-controller).
			// The decrypted entries go to a 0600 temp JSON file; only its PATH rides
			// launchContext (in-memory) — the passphrase never leaves this worker.
			// Dedup bubbling in the recorder makes re-runs idempotent: entries that
			// were already imported just bubble to the top, they never duplicate.
			let clipResult: ClipboardImportResult | null = null;
			let launched = false;
			if (includeClipboard && clipboard.length > 0) {
				const tmpClip = join(tmpdir(), `raycast-import-clip-${at}.json`);
				try {
					writeFileSync(tmpClip, JSON.stringify(clipboard), { mode: 0o600 });
					await showToast({
						style: Toast.Style.Success,
						title: "Clipboard import running in the background",
						message: `${clipboard.length} entries — progress shows as toasts; closing this window is safe.`,
					});
					// control transfers here: on success this command is unloaded
					await launchCommand({
						name: "import-clipboard",
						type: LaunchType.UserInitiated,
						context: { file: tmpClip },
					});
					launched = true;
				} catch (err) {
					rmSync(tmpClip, { force: true });
					await showToast({
						style: Toast.Style.Failure,
						title: "Background import unavailable — importing inline instead",
						message: err instanceof Error ? err.message : String(err),
					});
					clipResult = await importClipboardHistory(clipboard);
				}
			} else if (includeClipboard) {
				clipResult = {
					status: "ok",
					imported: 0,
					skippedDupes: 0,
					skippedImagesFiles: 0,
					skippedEmpty: 0,
					errors: [],
				};
			}

			if (!launched) {
				push(
					<ResultList
						imported={imported}
						skipped={skipped}
						totalExported={entries.length}
						replace={replace}
						clipResult={clipResult}
						emojiImported={emojiImported}
					/>,
				);
			}
		} catch (err) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Import failed",
				message: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Form
			navigationTitle="Import Raycast Data"
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Import" icon={Icon.Download} onSubmit={onSubmit} />
				</ActionPanel>
			}
		>
			<Form.Description
				text={
					"Pick a Raycast 'Export Snippets' (.json) file, or a full '.rayconfig' backup from 'Export Settings & Data'. For .rayconfig we decrypt locally with your passphrase (never transmitted)."
				}
			/>
			<Form.FilePicker
				id="raycastFile"
				title="Raycast Export"
				info="A .json from Export Snippets, or a .rayconfig backup."
				canChooseFiles={true}
				canChooseDirectories={false}
				allowMultipleSelection={false}
				storeValue={true}
			/>
			<Form.PasswordField
				id="passphrase"
				title="Export passphrase"
				placeholder="Only needed for .rayconfig backups"
				info="The passphrase set in Raycast → Settings → Extensions → Export Settings & Data."
				// VICINAE QUIRK (vs Raycast): storeValue=false EXCLUDES a field from the
				// submitted values entirely (ExtensionFormModel::submit() skips it) — it does
				// NOT mean "don't persist". The host persists no form values, so true is safe.
				storeValue={true}
			/>
			<Form.Checkbox
				id="replaceExisting"
				title="Replace existing"
				label="Delete current Vicinae snippets before importing"
				defaultValue={false}
				storeValue={true}
			/>
			<Form.Description
				text={
					"After import: quit and reopen Vicinae for snippets to load (the core caches them in memory at startup)."
				}
			/>
			<Form.Checkbox
				id="importClipboard"
				title="Import clipboard history"
				label="Also import clipboard history from this backup (text + links)"
				defaultValue={false}
				storeValue={true}
			/>
			<Form.Description
				text={
					"Clipboard import is only available from a .rayconfig backup. It copies each text/link entry through Vicinae's own clipboard recorder (works with encryption on, and searchable afterwards). Images/files aren't included (no body in the export). Runs ~1.7 entries/sec, so the full set takes roughly 45-50 minutes — your clipboard will be overwritten as it goes."
				}
			/>
			<Form.Checkbox
				id="importEmoji"
				title="Import emoji history"
				label="Also import emoji frequency + custom keywords from this backup"
				defaultValue={false}
				storeValue={true}
			/>
			<Form.Description
				text={
					"Emoji import restores your frequently-used emoji (ranking) and custom keyword search terms. The emoji table itself is built into Vicinae — this imports metadata only."
				}
			/>
		</Form>
	);
}

function ResultList({
	imported,
	skipped,
	totalExported,
	replace,
	clipResult,
	emojiImported,
}: {
	imported: VicinaeSnippet[];
	skipped: string[];
	totalExported: number;
	replace: boolean;
	clipResult: ClipboardImportResult | null;
	emojiImported: number;
}) {
	const clipNote =
		clipResult && clipResult.status === "ok"
			? `${clipResult.imported} clipboard entries imported${clipResult.skippedDupes ? `, ${clipResult.skippedDupes} already in history (bubbled)` : ""}${clipResult.skippedImagesFiles ? `, ${clipResult.skippedImagesFiles} image/file entries skipped` : ""}`
			: null;
	return (
		<List isLoading={false} navigationTitle="Import result">
			<List.Section title="Imported" subtitle={`${imported.length} of ${totalExported} snippets`}>
				{imported.map((n) => (
					<List.Item
						key={n.id}
						title={n.name}
						subtitle={n.data.text?.slice(0, 80)}
						icon={Icon.CheckCircle}
						accessories={
							n.expansion?.keyword
								? [{ text: `⌥ ${n.expansion.keyword}`, icon: Icon.Keyboard }]
								: []
						}
						actions={
							<ActionPanel>
								<Action.CopyToClipboard
									title="Copy Content"
									content={n.data.text ?? ""}
								/>
							</ActionPanel>
						}
					/>
				))}
				{imported.length === 0 && (
					<List.Item
						title="Nothing to import"
						subtitle="All entries were skipped as duplicates or empty."
						icon={Icon.Info}
					/>
				)}
			</List.Section>
			<List.Section
				title={
					emojiImported > 0
						? `Emoji (${emojiImported} merged)`
						: clipNote
							? "Clipboard"
							: "⚠️ Restart required"
				}
				subtitle={
					emojiImported > 0
						? "Emoji frequency + keywords restored. Restart Vicinae to show them."
						: clipNote
							? clipNote
							: replace
								? "Vicinae snippets were replaced. Quit and reopen Vicinae."
								: "Quit and reopen Vicinae for the imported snippets to appear."
				}
			>
				<List.Item
					title={
						skipped.length > 0
							? `${skipped.length} entries skipped (${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? ", …" : ""})`
							: "No duplicates found"
					}
					icon={Icon.Info}
				/>
			</List.Section>
		</List>
	);
}

export default function Command(): JSX.Element {
	return <ImportForm />;
}
