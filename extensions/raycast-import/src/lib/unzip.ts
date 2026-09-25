// ---- Minimal dependency-free ZIP extractor (central-directory based) ----
// Enough for Raycast store extension zips: standard zip64-less archives,
// compression method 0 (stored) or 8 (deflate). Handles data-descriptor
// zips correctly by reading the central directory (sizes come from there,
// not from the local header).
//
// SECURITY (SECURITY-001): a zip is untrusted input. Every entry name is
// sanitized BEFORE any write — absolute paths, drive letters, empty segments
// and `..` traversal are rejected, and the resolved path must stay inside
// `destDir` (verified with a prefix check on the normalized absolute path).
// Symlink entries are skipped (never materialized), so nothing can point
// outside the extract root.

import { inflateRawSync } from "node:zlib";
import { join, dirname, resolve, sep, normalize } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CD_SIG = 0x02014b50;
const ZIP_LOCAL_SIG = 0x04034b50;

interface CdEntry {
	name: string;
	compression: number;
	compressedSize: number;
	uncompressedSize: number;
	localHeaderOffset: number;
	attrs: number;
}

function findEocd(buf: Buffer): number {
	// EOCD is within the last 65557 bytes (max comment 65535 + 22-byte EOCD)
	const start = Math.max(0, buf.length - 65557);
	for (let i = buf.length - 22; i >= start; i--) {
		if (buf.readUInt32LE(i) === ZIP_EOCD_SIG) return i;
	}
	throw new Error("zip: no end-of-central-directory record");
}

function listEntries(buf: Buffer): CdEntry[] {
	const eocd = findEocd(buf);
	const cdCount = buf.readUInt16LE(eocd + 10);
	const cdSize = buf.readUInt32LE(eocd + 12);
	const cdOffset = buf.readUInt32LE(eocd + 16);
	const entries: CdEntry[] = [];
	let p = cdOffset;
	const end = cdOffset + cdSize;
	for (let i = 0; i < cdCount && p + 46 <= end; i++) {
		if (buf.readUInt32LE(p) !== ZIP_CD_SIG) break;
		const compression = buf.readUInt16LE(p + 10);
		const compressedSize = buf.readUInt32LE(p + 20);
		const uncompressedSize = buf.readUInt32LE(p + 24);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const localHeaderOffset = buf.readUInt32LE(p + 42);
		const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
		const attrs = buf.readUInt32LE(p + 38); // external file attributes (unix mode in high 16 bits)
		entries.push({ name, compression, compressedSize, uncompressedSize, localHeaderOffset, attrs });
		p += 46 + nameLen + extraLen + commentLen;
	}
	return entries;
}

function readEntryData(buf: Buffer, entry: CdEntry): Buffer {
	// local file header: sig(4) ver(2) flags(2) method(2) time(2) date(2)
	// crc(4) csize(4) usize(4) nameLen(2) extraLen(2) => header = 30 + nameLen + extraLen
	if (buf.readUInt32LE(entry.localHeaderOffset) !== ZIP_LOCAL_SIG) {
		throw new Error(`zip: bad local header for ${entry.name}`);
	}
	const nameLen = buf.readUInt16LE(entry.localHeaderOffset + 26);
	const extraLen = buf.readUInt16LE(entry.localHeaderOffset + 28);
	const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen;
	const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);
	if (raw.length !== entry.compressedSize) {
		throw new Error(`zip: truncated data for ${entry.name}`);
	}
	if (entry.compression === 0) return raw;
	if (entry.compression === 8) return inflateRawSync(raw);
	throw new Error(`zip: unsupported compression method ${entry.compression} for ${entry.name}`);
}

/**
 * Sanitize an entry's relative path so it can't escape `destDir`.
 * Returns a safe relative path (POSIX-style, using `/`), or null to skip.
 * Rejects absolute paths, Windows drive prefixes, empty/dot/`..` segments.
 */
function safeRelPath(name: string): string | null {
	let n = name.replace(/\\/g, "/"); // tolerate backslashes from hostile zips
	if (n.startsWith("/") || /^[a-zA-Z]:\//.test(n)) return null; // absolute
	const segs: string[] = [];
	for (const seg of n.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") return null; // traversal
		segs.push(seg);
	}
	// entry is just a directory marker (trailing /) or empty -> keep it as dir path
	return segs.length === 0 ? null : segs.join("/");
}

/** Check `candidate` (absolute) is inside `base` (absolute, already resolved). */
function isWithin(base: string, candidate: string): boolean {
	const rel = candidate.slice(base.length);
	return rel.length === 0 || rel.startsWith(sep) || rel.startsWith("/");
}

/**
 * Extract a zip buffer to `destDir`.
 *
 * `stripComponents` drops the first N path segments of every entry (mirrors
 * unzip's -j/-d family semantics; Vicinae's installer uses stripComponents=1
 * because Raycast store zips have a single top-level folder with a
 * package.json at its root).
 *
 * Directory-only entries are ignored as files (their dirs are still created
 * via parents). Symlinks are skipped (defensive). Entry names are sanitized
 * (see safeRelPath) so no write can escape `destDir`.
 */
export function extractZip(
	zip: Buffer,
	destDir: string,
	opts: { stripComponents?: number } = {},
): void {
	const strip = opts.stripComponents ?? 0;
	const root = resolve(destDir);
	const entries = listEntries(zip);
	for (const entry of entries) {
		// symlink entries (unix mode S_IFLNK = 0o120000 in external attrs high bits)
		const mode = (entry.attrs >>> 16) & 0xffff;
		if ((mode & 0o170000) === 0o120000) continue;

		const san = safeRelPath(entry.name);
		if (san === null) continue; // absolute / traversal / empty — skip, never throw on hostile names

		// strip leading segments of the ORIGINAL path
		const parts = san.split("/");
		const relParts = parts.slice(strip);
		if (relParts.length === 0) continue; // entirely stripped (e.g. top folder itself)

		const rel = relParts.join("/");
		const abs = resolve(root, rel);
		if (!isWithin(root, abs)) continue; // containment double-check

		const isDir = entry.name.endsWith("/") || rel.endsWith("/");
		if (isDir) {
			mkdirSync(abs, { recursive: true });
			continue;
		}
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, readEntryData(zip, entry));
	}
}
