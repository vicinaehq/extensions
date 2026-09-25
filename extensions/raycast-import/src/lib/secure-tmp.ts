import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";

// ---- Secure inter-command payload passing (blocks SECURITY-003) ----
//
// The view command must hand decrypted data (clipboard entries, extension
// picks) to the headless background worker without the decrypted content ever
// sitting at a predictable path. Strategy:
//   - write into an UNPREDICTABLE dir (fs.mkdtemp under os.tmpdir(), mode 0700)
//     — never a fixed-name file like /tmp/vicinae-import-clip-<n>.json
//   - ENCRYPT the payload with AES-256-GCM under a fresh random 256-bit key;
//     only the key hex rides the in-memory launch context (never disk)
//   - the loader deletes the whole dir on EVERY exit path (read failure, empty
//     payload, success, error) via try/finally, and a stale-dir sweep cleans up
//     leftovers from interrupted runs.

const PREFIX = "raycast-import-secret-";

export interface SecretPayload {
	dir: string;
	key: string;
}

export const SECRET_PREFIX = PREFIX;

/** Create an unpredictable 0700 temp dir holding an AES-256-GCM-encrypted copy
 *  of `data`. Returns dir path + key hex; the key is NOT written to disk. */
export function writeSecretPayload(data: unknown): SecretPayload {
	const dir = mkdtempSync(join(tmpdir(), PREFIX));
	const key = randomBytes(32);
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	writeFileSync(join(dir, "payload.bin"), Buffer.concat([iv, tag, enc]), { mode: 0o600 });
	return { dir, key: key.toString("hex") };
}

/** Decrypt and parse a payload written by writeSecretPayload. */
export function readSecretPayload<T>(payload: SecretPayload): T {
	const raw = readFileSync(join(payload.dir, "payload.bin"));
	const iv = raw.subarray(0, 12);
	const tag = raw.subarray(12, 28);
	const enc = raw.subarray(28);
	const decipher = createDecipheriv("aes-256-gcm", Buffer.from(payload.key, "hex"), iv);
	decipher.setAuthTag(tag);
	const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
	return JSON.parse(json) as T;
}

/** Delete a secret payload dir (idempotent, best-effort). */
export function deleteSecretPayload(payload: SecretPayload): void {
	try {
		rmSync(payload.dir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
}

/** Sweep leftover secret dirs from interrupted runs that never got to clean up.
 *  Conservative: only removes dirs older than maxAgeMs. Call once at import
 *  start (and at worker start) — cheap, no-scan app impact. */
export function cleanupStaleSecrets(maxAgeMs = 6 * 60 * 60 * 1000): void {
	let names: string[];
	try {
		names = readdirSync(tmpdir());
	} catch {
		return;
	}
	const now = Date.now();
	for (const name of names) {
		if (!name.startsWith(PREFIX)) continue;
		const p = join(tmpdir(), name);
		try {
			const st = statSync(p);
			if (now - st.mtimeMs > maxAgeMs) rmSync(p, { recursive: true, force: true });
		} catch {
			/* best effort */
		}
	}
}
