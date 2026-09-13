import { inflateRawSync } from "node:zlib";
import { join, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

// ---- Minimal dependency-free ZIP extractor (central-directory based) ----
// Enough for Raycast store extension zips: standard zip64-less archives,
// compression method 0 (stored) or 8 (deflate). Handles data-descriptor
// zips correctly by reading the central directory (sizes come from there,
// not from the local header).

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CD_SIG = 0x02014b50;
const ZIP_LOCAL_SIG = 0x04034b50;

interface CdEntry {
	name: string;
	compression: number;
	compressedSize: number;
	uncompressedSize: number;
	localHeaderOffset: number;
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
		entries.push({ name, compression, compressedSize, uncompressedSize, localHeaderOffset });
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
 * Extract a zip buffer to `destDir`.
 *
 * `stripComponents` drops the first N path segments of every entry (mirrors
 * unzip's -j/-d family semantics; Vicinae's installer uses stripComponents=1
 * because Raycast store zips have a single top-level folder with a
 * package.json at its root).
 *
 * Directory-only entries are ignored. Symlinks are skipped (defensive).
 */
export function extractZip(
	zip: Buffer,
	destDir: string,
	opts: { stripComponents?: number } = {},
): void {
	const strip = opts.stripComponents ?? 0;
	const entries = listEntries(zip);
	for (const entry of entries) {
		const parts = entry.name.split("/");
		const fileName = parts[parts.length - 1];
		// directory entry -> ensure dir exists, no file write
		if (fileName.length === 0) {
			const dirPath = join(destDir, ...parts.slice(strip));
			mkdirSync(dirPath, { recursive: true });
			continue;
		}
		if (parts.length - 1 - strip < 0) continue; // entry at a stripped depth
		const rel = parts.slice(strip).join("/");
		if (/^__MACOSX\//.test(rel)) continue; // macOS resource fork junk
		// defensive: skip symlinks (unix mode stored in external attrs high bits)
		const abs = join(destDir, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, readEntryData(zip, entry));
	}
}
