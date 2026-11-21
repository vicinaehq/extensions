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
import {
	deleteSecretPayload,
	writeSecretPayload,
	cleanupStaleSecrets,
} from "./lib/secure-tmp";
import { importClipboardRecords, type ClipboardRecord } from "./lib/clipboard-import";
import { installExtensions as installExtensionsCore, type ExtensionPick } from "./lib/extensions-install";
import { findNodeExtensions, type RaycastNodeExtension } from "./lib/raycast";

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

// Tinycast/Raycast rich-text doc (TipTap/ProseMirror-like):
//   rawContent = { type:"doc", content:[ { type:"paragraph", content:[
//       { type:"text", text:"Hello "}, { type:"text", marks:[...], text:"world" } ] },
//     { type:"paragraph", content:[...] } ] }
// Inline leaves inside one block must be CONCATENATED (no newline between
// adjacent formatted spans); newlines only separate block-level nodes
// (paragraph/heading/codeBlock/blockquote/list). At the end, collapse runs of
// 2+ newlines to a single one so the result reads like a plain snippet.
const RICH_TEXT_BLOCK_TYPES = new Set([
	"paragraph",
	"heading",
	"codeBlock",
	"blockquote",
	"bulletList",
	"orderedList",
	"listItem",
	"list",
	"hardBreak",
	"horizontalRule",
	"table",
	"tableRow",
	"tableCell",
	"tableHeader",
]);

function extractRichText(raw: unknown): string {
	if (!raw || typeof raw !== "object") return "";
	const blocks: string[] = [];
	let inline = "";

	const flush = () => {
		blocks.push(inline);
		inline = "";
	};

	const isBlock = (n: Record<string, unknown>): boolean => {
		const t = (n["type"] ?? "").toString();
		return RICH_TEXT_BLOCK_TYPES.has(t);
	};

	const walk = (node: Record<string, unknown> | unknown[], depth: number) => {
		if (depth > 16) return;
		if (Array.isArray(node)) {
			for (const el of node) {
				if (el && typeof el === "object") {
					const n = el as Record<string, unknown>;
					const block = isBlock(n);
					// close any pending inline run before hitting a block, and close
					// the block's own text after it (each block = one line)
					if (block && inline.length > 0) flush();
					walk(n, depth + 1);
					if (block && inline.length > 0) flush();
				}
			}
			return;
		}
		const n = node as Record<string, unknown>;
		if (typeof n["text"] === "string") inline += n["text"] as string;
		const content = n["content"];
		if (Array.isArray(content)) walk(content, depth + 1);
		else if (content && typeof content === "object") walk(content as Record<string, unknown>, depth + 1);
	};
	walk(raw as Record<string, unknown>, 0);
	if (inline) flush();

	const text = blocks
		.join("\n")
		.replace(/\n{2,}/g, "\n")
		.replace(/^\n+|\n+$/g, "");
	return text;
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

// Recognized Raycast export top-level groups and the field that must hold the
// actual data array. Used by looksLikeRaycastExport() to reject unrelated JSON
// BEFORE any store is modified (CORRECTNESS-001: an invalid .json must never
// erase snippets via "Replace existing"). Presence of a key alone is NOT
// enough — the value must be (or contain) an array of entries, so generic
// objects carrying keys like `settings` or `notes` don't pass.
const RAYCAST_EXPORT_GROUPS: { key: string; container?: string }[] = [
	{ key: "snippets", container: "snippets" },
	{ key: "builtin_package_snippets", container: "snippets" },
	{ key: "clipboardHistory", container: "clipboardEntries" },
	{ key: "builtin_package_clipboardHistory", container: "clipboardEntries" },
	{ key: "emoji", container: "emojis" },
	{ key: "builtin_package_emoji", container: "emojis" },
	{ key: "nodeExtensions", container: "extensions" },
	{ key: "quicklinks", container: "quicklinks" },
];

/** True if `value` is a Raycast data container: either the bare array itself
 *  (`snippets: [...]`) or an object whose `container` field is the array
 *  (`nodeExtensions: { schemaVersion, extensions: [...] }`). */
function isRaycastContainer(value: unknown, container?: string): boolean {
	if (Array.isArray(value)) return true;
	if (value === null || typeof value !== "object") return false;
	const obj = value as Record<string, unknown>;
	return container ? Array.isArray(obj[container]) : Object.values(obj).some(Array.isArray);
}

/** True if `data` looks like a Raycast export (v1 snippet array, or an object
 *  carrying at least one structurally valid Raycast data group). */
export function looksLikeRaycastExport(data: unknown): boolean {
	if (Array.isArray(data)) {
		// v1 "Export Snippets" is a bare array of snippet objects — accept any
		// array that PLAUSIBLY holds snippets (objects with a name/text/keyword)
		if (data.length === 0) return true; // structurally valid empty export
		return data.every(
			(e) => e !== null && typeof e === "object" && ("name" in e || "text" in e || "keyword" in e),
		);
	}
	if (data === null || typeof data !== "object") return false;
	const obj = data as Record<string, unknown>;
	return RAYCAST_EXPORT_GROUPS.some(
		(g) => g.key in obj && isRaycastContainer(obj[g.key], g.container),
	);
}

/** True if `data` carries a SNIPPET data container specifically. For an object
 *  export this means a `snippets`/`builtin_package_snippets` group holding an
 *  array. A bare array is the v1 "Export Snippets" form — even an empty one is
 *  a structurally valid empty snippet export the user intentionally replaced
 *  with. Used to guard the snippet-store write so a valid but snippet-less
 *  export (e.g. only `quicklinks`) can never erase the store in replace mode. */
function hasSnippetContainer(data: unknown): boolean {
	if (Array.isArray(data)) return true;
	if (data === null || typeof data !== "object") return false;
	const obj = data as Record<string, unknown>;
	return ["snippets", "builtin_package_snippets"].some(
		(k) => k in obj && isRaycastContainer(obj[k], "snippets"),
	);
}

function readExportSnippets(file: string, passphrase: string): {
	snippets: { name: string; text: string; keyword?: string }[];
	clipboard: { text: string; category: string; applicationPath?: string }[];
	emoji: RaycastEmoji[];
	extensions: RaycastNodeExtension[];
	hasSnippets: boolean;
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
			if (!looksLikeRaycastExport(parsed)) throw new Error("notRaycast");
			const arr = Array.isArray(parsed)
				? parsed
				: (parsed as { snippets?: unknown }).snippets ?? [];
			return {
				snippets: findSnippetsInExport(arr),
				clipboard: [],
				emoji: [],
				extensions: [],
				hasSnippets: hasSnippetContainer(parsed),
			};
		} catch (err) {
			if (err instanceof Error && err.message === "notRaycast") throw new Error("notRaycast");
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
		if (!looksLikeRaycastExport(res.data)) throw new Error("notRaycast");
		return {
			snippets: findSnippetsInExport(res.data),
			clipboard: findClipboardInExport(res.data),
			emoji: findEmojiInExport(res.data),
			extensions: findNodeExtensions(res.data),
			hasSnippets: hasSnippetContainer(res.data),
		};
	}
	const res = decryptV1(buf, passphrase);
	if (!res.ok) throw new Error(res.error);
	if (!looksLikeRaycastExport(res.data)) throw new Error("notRaycast");
	return {
		snippets: findSnippetsInExport(res.data),
		clipboard: findClipboardInExport(res.data),
		emoji: findEmojiInExport(res.data),
		extensions: findNodeExtensions(res.data),
		hasSnippets: hasSnippetContainer(res.data),
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
	const rawText = rc.text ?? "";
	const text = rawText.trim();
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
		data: { text: rawText }, // preserve intentional leading/trailing whitespace
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

// ---- Inline extension-install fallback (used only if the background handoff
//      fails on an old runtime) ---

async function importExtensionsInline(picks: { name: string; author: string }[]): Promise<void> {
	const toast = await showToast({
		style: Toast.Style.Animated,
		title: "Installing Raycast extensions…",
		message: `0/${picks.length} done`,
	});
	const report = await installExtensionsCore(picks, (done, total, installed, skipped, failed) => {
		toast.message = `${done}/${total} — ${installed} installed, ${skipped} already present, ${failed} failed`;
	});
	if (report.failures.length === 0) {
		toast.style = Toast.Style.Success;
		toast.title = "Extensions installed";
		toast.message = `${report.installed} installed${report.skipped ? `, ${report.skipped} already present` : ""}`;
	} else {
		toast.style = Toast.Style.Failure;
		toast.title = `Extensions finished with ${report.failures.length} failure${report.failures.length > 1 ? "s" : ""}`;
		toast.message = `${report.installed} installed, ${report.skipped} skipped. First: ${report.failures[0].name} — ${report.failures[0].error}`;
	}
}

// ---- UI ----

function ImportForm() {
	const { push, pop } = useNavigation();
	const [submitting, setSubmitting] = useState(false);
	// Controlled form values (so the "Choose extensions…" button can act on the
	// currently-typed file + passphrase without a submit).
	const [extFile, setExtFile] = useState<string | undefined>();
	const [extPass, setExtPass] = useState<string>("");
	// Extensions the user picked in the picker (null = never picked → default all).
	const [pickedExtensions, setPickedExtensions] = useState<{ name: string; author: string }[] | null>(null);

	async function chooseExtensions(filePath: string | undefined, passphrase: string) {
		if (!filePath) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Pick a file first",
				message: "Select your Raycast export above, then choose extensions.",
			});
			return;
		}
		let parsed;
		try {
			parsed = readExportSnippets(filePath, passphrase);
		} catch (err) {
			const code = err instanceof Error ? err.message : "corrupt";
			await showToast({
				style: Toast.Style.Failure,
				title: code === "passphrase" ? "Incorrect passphrase" : "Can't read export",
				message:
					code === "passphrase"
						? "Enter the passphrase you set in Raycast → Settings → Extensions → Export Settings & Data."
						: code === "notRaycast"
							? "This doesn't look like a Raycast export."
							: err instanceof Error ? err.message : String(err),
			});
			return;
		}
		if (parsed.extensions.length === 0) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No extensions in this export",
				message: "Extensions are only included in a .rayconfig backup (not plain .json).",
			});
			return;
		}
		push(
			<ExtensionPicker
				extensions={parsed.extensions}
				initialSelected={new Set(
					(pickedExtensions ?? parsed.extensions).map((e) => e.name),
				)}
				onDone={(picks) => {
					setPickedExtensions(picks);
					pop();
				}}
			/>,
		);
	}

	async function onSubmit(input: Form.Values) {
		const file = Array.isArray(input.raycastFile)
			? input.raycastFile[0]
			: (input.raycastFile as string | undefined);
		const replace = Boolean(input.replaceExisting);
		const includeClipboard = Boolean(input.importClipboard);
		// Pre-picking extensions (Choose extensions… button) implies importing them,
		// even if the mount-time checkbox default was false.
		const includeExtensions =
			Boolean(input.importExtensions) || pickedExtensions !== null;
		const passphrase = String(input.passphrase ?? "");

		setSubmitting(true);
		try {
			cleanupStaleSecrets();
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
			let extensions: RaycastNodeExtension[];
			let hasSnippets = false;
			try {
				const parsed = readExportSnippets(file, passphrase);
				entries = parsed.snippets;
				clipboard = parsed.clipboard;
				emojis = parsed.emoji;
				extensions = parsed.extensions;
				hasSnippets = parsed.hasSnippets;
			} catch (err) {
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

			// CORRECTNESS-001: only touch the snippet store when the validated
			// export actually carries a snippet container. A valid but
			// snippet-less export (e.g. only quicklinks/emoji/nodeExtensions)
			// must never overwrite the store with an empty array in replace
			// mode.
			if (hasSnippets) {
				if (existsSync(snippetsPath())) {
					const b = `${snippetsPath()}.bak-${at}`;
					renameSync(snippetsPath(), b);
				}
				mkdirSync(dirname(snippetsPath()), { recursive: true });
				const all = [...existing, ...imported];
				const tmp = `${snippetsPath()}.tmp-${at}`;
				writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n", "utf8");
				renameSync(tmp, snippetsPath());
			} else {
				await showToast({
					style: Toast.Style.Warning,
					title: "No snippets in this export",
					message:
						"This file doesn't contain a snippet list, so your snippet store was left untouched (replace mode would otherwise have emptied it).",
				});
			}

			// emoji metadata (frecency + custom keywords) — safe atomic merge
			const includeEmoji = Boolean(input.importEmoji);
			const emojiImported = includeEmoji ? importEmojiMetadata(emojis) : 0;

			// Background work (clipboard stream + extension installs) runs in ONE
			// headless no-view command (import-background) so it survives window
			// dismissal. The payload (decrypted clipboard entries + extension picks)
			// is written to an UNPREDICTABLE 0700 temp dir, ENCRYPTED with
			// AES-256-GCM under an ephemeral 256-bit key — only {dir, key} rides
			// launchContext (in-memory); the passphrase never leaves this worker.
			// The worker deletes the dir on every exit path and a stale sweep
			// clears leftovers from interrupted runs (SECURITY-003).
			const clipAvailable = includeClipboard && clipboard.length > 0;
			// If the user picked extensions (Choose extensions… button), use that
			// exact set; if they didn't pick but enabled the checkbox, default to
			// ALL extensions in the export.
			const extPick =
				pickedExtensions !== null
					? pickedExtensions
					: extensions.map((e) => ({ name: e.name, author: e.author }));
			// Only treat extensions as available when the FINAL selection is
			// non-empty. If the user deselected every one in the picker, extPick
			// is [] — fall through to the normal result view instead of
			// launching a no-op background import (UX-002).
			const extsAvailable = includeExtensions && extPick.length > 0;

			// helper: write encrypted payload + hand off to the background worker,
			// falling back to inline (same core loops) if the handoff fails.
			const runBackground = async (payload: {
				clipboard?: ClipboardRecord[];
				extensions?: { name: string; author: string }[];
			}) => {
				const sp = writeSecretPayload(payload);
				try {
					await showToast({
						style: Toast.Style.Success,
						title: "Import running in the background",
						message:
							payload.clipboard && payload.clipboard.length > 0
								? `${payload.clipboard.length} clipboard entries + ${
										payload.extensions?.length ?? 0
								  } extensions — progress shows as toasts; closing this window is safe.`
								: `${payload.extensions?.length ?? 0} extensions — progress shows as toasts; closing this window is safe.`,
					});
					// control transfers here: on success this command is unloaded
					await launchCommand({
						name: "import-background",
						type: LaunchType.UserInitiated,
						context: { dir: sp.dir, key: sp.key },
					});
				} catch (err) {
					deleteSecretPayload(sp);
					await showToast({
						style: Toast.Style.Failure,
						title: "Background import unavailable — importing inline instead",
						message: err instanceof Error ? err.message : String(err),
					});
					if (payload.clipboard && payload.clipboard.length > 0) {
						await importClipboardRecords(payload.clipboard);
					}
					if (payload.extensions && payload.extensions.length > 0) {
						await importExtensionsInline(payload.extensions);
					}
				}
			};

			if (extsAvailable || clipAvailable) {
				await runBackground({
					...(clipAvailable ? { clipboard } : {}),
					...(extsAvailable ? { extensions: extPick } : {}),
				});
			} else {
				push(
					<ResultList
						imported={imported}
						skipped={skipped}
						totalExported={entries.length}
						replace={replace}
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
			isLoading={submitting}
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Import" icon={Icon.Download} onSubmit={onSubmit} />
					<Action
						title="Choose extensions…"
						icon={Icon.CheckList}
						onAction={() => chooseExtensions(extFile, extPass)}
						shortcut={{ modifiers: ["cmd"], key: "e" }}
					/>
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
				// NOTE: deliberately UNCONTROLLED (no value prop) — the RDK renders the
				// native picker's own filename display, which breaks if we force `value`.
				// We only subscribe to onChange to keep our state in sync for the
				// "Choose extensions…" button / auto-open flow.
				onChange={(v) => setExtFile(Array.isArray(v) ? (v[0] ?? undefined) : v)}
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
				// UNCONTROLLED too (no value prop) for same reason as FilePicker.
				onChange={setExtPass}
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
			<Form.Checkbox
				id="importExtensions"
				title="Import Raycast extensions"
				label="Reinstall your installed Raycast extensions (from this backup — .rayconfig only)"
				defaultValue={pickedExtensions !== null}
				storeValue={true}
				// Toggling the checkbox ON opens the picker immediately (so the
				// option can't be missed); toggling OFF clears any picked selection.
				onChange={(checked) => {
					if (checked) {
						setPickedExtensions(null);
						chooseExtensions(extFile, extPass);
					} else {
						setPickedExtensions(null);
					}
				}}
			/>
			<Form.Description
				text={
					pickedExtensions !== null
						? `✅ ${pickedExtensions.length} extension${pickedExtensions.length === 1 ? "" : "s"} chosen — toggle the box off to skip, or press "Choose extensions…" (⌘E) to change the selection.`
						: 'Tick the box above to import extensions (the picker opens automatically) — or press "Choose extensions…" (⌘E) any time. All are pre-selected; already-installed ones are skipped. Only available from a .rayconfig backup.'
				}
			/>
		</Form>
	);
}

function ExtensionPicker({
	extensions,
	initialSelected,
	onDone,
}: {
	extensions: RaycastNodeExtension[];
	initialSelected: Set<string>;
	onDone: (picks: { name: string; author: string }[]) => void;
}) {
	const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));

	const toggle = (name: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	};

	const selectAll = () => setSelected(new Set(extensions.map((e) => e.name)));
	const deselectAll = () => setSelected(new Set());
	const count = selected.size;

	const picked = extensions.filter((e) => selected.has(e.name)).map((e) => ({ name: e.name, author: e.author }));

	const done = () => onDone(picked);

	return (
		<List
			navigationTitle="Choose Raycast extensions"
			searchBarPlaceholder={`Search ${extensions.length} extensions…`}
			actions={
				<ActionPanel>
					<Action title={`Use ${count} selected`} icon={Icon.Checkmark} onAction={done} />
					<Action title="Select all" icon={Icon.CheckCircle} onAction={selectAll} shortcut={{ modifiers: ["cmd"], key: "a" }} />
					<Action title="Deselect all" icon={Icon.Circle} onAction={deselectAll} shortcut={{ modifiers: ["cmd", "shift"], key: "a" }} />
				</ActionPanel>
			}
		>
			<List.Section title="Extensions" subtitle={`${count} of ${extensions.length} selected`}>
				{extensions.map((e) => {
					const on = selected.has(e.name);
					return (
						<List.Item
							key={e.name}
							title={e.name}
							subtitle={e.author}
							icon={on ? Icon.CheckCircle : Icon.Circle}
							accessories={on ? [{ icon: Icon.Checkmark }] : []}
							actions={
								<ActionPanel>
									{/* "Use N selected" is the PRIMARY action (Enter) on every item —
									    the path forward from the picker. List-level actions only
									    render in the empty-search state. */}
									<Action title={`Use ${count} selected`} icon={Icon.Checkmark} onAction={done} />
									<Action
										title={on ? "Deselect" : "Select"}
										icon={on ? Icon.Checkmark : Icon.Circle}
										onAction={() => toggle(e.name)}
										shortcut={{ modifiers: ["cmd"], key: "s" }}
									/>
									<Action title="Select all" icon={Icon.CheckCircle} onAction={selectAll} shortcut={{ modifiers: ["cmd"], key: "a" }} />
									<Action title="Deselect all" icon={Icon.Circle} onAction={deselectAll} shortcut={{ modifiers: ["cmd", "shift"], key: "a" }} />
								</ActionPanel>
							}
						/>
					);
				})}
			</List.Section>
		</List>
	);
}

function ResultList({
	imported,
	skipped,
	totalExported,
	replace,
	emojiImported,
}: {
	imported: VicinaeSnippet[];
	skipped: string[];
	totalExported: number;
	replace: boolean;
	emojiImported: number;
}) {
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
				title={emojiImported > 0 ? `Emoji (${emojiImported} merged)` : "⚠️ Restart required"}
				subtitle={
					emojiImported > 0
						? "Emoji frequency + keywords restored. Restart Vicinae to show them."
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
