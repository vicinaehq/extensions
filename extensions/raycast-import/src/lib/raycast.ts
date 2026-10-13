import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createDecipheriv, scryptSync, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

// ---- Shared Raycast .rayconfig parsing (also used by import-data.tsx) ----
// v1 (Raycast 1.x):   file = IV(16) || AES-256-CBC( gzip(JSON), PKCS#7 ), key = SHA-256(passphrase)
// v2 (schemaVersion 3, RAYCFG3): "RAYCFG3\n" + u32le gzipLen + gzip(envelope JSON
//                      {exportedAt, appVersion, encryption:{iv,salt}, schemaVersion}) +
//                      AES-256-GCM payload (16B tag appended). Key = scrypt(passphrase,
//                      salt, N=16384, r=8, p=1, dkLen=32). GCM plaintext = gzip of big JSON.
// Detection: leading "RAYC\0" magic => RAYCFG3 v2; leading gzip magic (1f 8b 08) => legacy v2
//            envelope; else v1 (whole AES blocks).

export type DecryptResult =
	| { ok: true; data: unknown }
	| { ok: false; error: "notRaycast" | "passphrase" | "corrupt" };

function parseVicinaeJson(plain: Buffer): DecryptResult {
	try {
		return { ok: true, data: JSON.parse(plain.toString("utf8")) };
	} catch {
		return { ok: false, error: "corrupt" };
	}
}

// tiny local sha256 for v1 (matches EVP_BytesToKey single round => SHA-256(passphrase))
function sha256(data: string): Buffer {
	return createHash("sha256").update(data, "utf8").digest();
}

function decryptV1(raw: Buffer, passphrase: string): DecryptResult {
	try {
		if (raw.length < 32 || raw.length % 16 !== 0)
			return { ok: false, error: "notRaycast" };
		const iv = raw.subarray(0, 16);
		const ct = raw.subarray(16);
		const key = sha256(passphrase);
		const decipher = createDecipheriv("aes-256-cbc", key, iv);
		decipher.setAutoPadding(false);
		const finish: () => Buffer = decipher.final
			? () => decipher.final()
			: () => (decipher as unknown as { finalize: () => Buffer }).finalize();
		let pt = Buffer.concat([decipher.update(ct), finish()]);
		const pad = pt[pt.length - 1];
		if (pad < 1 || pad > 16 || pad > pt.length)
			return { ok: false, error: "passphrase" };
		pt = pt.subarray(0, pt.length - pad);
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

/** Decrypt/parse any Raycast export file into its root JSON object. Throws named errors. */
export function decryptRaycastFile(file: string, passphrase: string): unknown {
	const buf = readFileSync(file);
	const lower = file.toLowerCase();

	// plain JSON file (Raycast "Export Snippets") — unencrypted
	const isPlainJson =
		lower.endsWith(".json") ||
		(!lower.endsWith(".rayconfig") && !(buf[0] === 0x1f && buf[1] === 0x8b));

	if (isPlainJson) {
		try {
			return JSON.parse(buf.toString("utf8"));
		} catch {
			throw new Error("invalid-json");
		}
	}

	if (
		(buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08) ||
		(buf[0] === 0x52 && buf[1] === 0x41 && buf[2] === 0x59 && buf[3] === 0x43) // "RAYC"
	) {
		const res = decryptV2(buf, passphrase, buf[0] === 0x52);
		if (!res.ok) throw new Error(res.error);
		return res.data;
	}
	const res = decryptV1(buf, passphrase);
	if (!res.ok) throw new Error(res.error);
	return res.data;
}

// ---- Vicinae data dir (matches import-data.tsx) ----
export function dataDir(): string {
	if (process.platform === "win32")
		return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "vicinae", "data");
	if (process.platform === "darwin") return join(homedir(), ".local", "share", "vicinae");
	const xdg = process.env.XDG_DATA_HOME;
	return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".local", "share"), "vicinae");
}

export function extensionsDir(): string {
	return join(dataDir(), "extensions");
}

// ---- Raycast nodeExtensions extraction ----
export interface RaycastNodeExtension {
	uuid: string;
	name: string;
	author: string;
	version?: string;
	owner?: string;
}

export function findNodeExtensions(root: unknown): RaycastNodeExtension[] {
	const obj = (root ?? {}) as Record<string, unknown>;
	const raw = obj["nodeExtensions"];
	// real exports wrap it: { schemaVersion, extensions: [...] } — but tolerate a bare array too
	const list = Array.isArray(raw) ? raw : (raw as Record<string, unknown> | undefined)?.["extensions"];
	if (!Array.isArray(list)) return [];
	const out: RaycastNodeExtension[] = [];
	for (const item of list) {
		const e = (item ?? {}) as Record<string, unknown>;
		const name = (e["name"] ?? "").toString().trim();
		const author = (e["author"] ?? "").toString().trim();
		if (!name || !author) continue;
		out.push({
			uuid: (e["uuid"] ?? "").toString(),
			name,
			author,
			version: typeof e["version"] === "string" ? e["version"] : undefined,
			owner: typeof e["owner"] === "string" ? e["owner"] : undefined,
		});
	}
	return out;
}
