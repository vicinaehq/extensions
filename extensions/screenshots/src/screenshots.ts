import type { FileHandle } from "node:fs/promises";
import { open, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const IMAGE_EXTENSIONS: Record<string, true> = {
	".png": true,
	".jpg": true,
	".jpeg": true,
	".webp": true,
};

export type ImageSize = { width: number; height: number };

export type Screenshot = {
	path: string;
	name: string;
	bytes: number;
	createdAt: Date;
	/** Undefined when the header could not be parsed. */
	size?: ImageSize;
};

/** Expands a leading `~` and makes the path absolute. */
export function resolveDirectory(directory: string): string {
	const trimmed = directory.trim();
	if (trimmed === "~") return os.homedir();
	if (trimmed.startsWith("~/"))
		return path.join(os.homedir(), trimmed.slice(2));
	return path.resolve(trimmed);
}

/** Image files directly inside `directory`, newest first. */
export async function listScreenshots(
	directory: string,
): Promise<Screenshot[]> {
	const names = (await readdir(directory)).filter(
		(name) => IMAGE_EXTENSIONS[path.extname(name).toLowerCase()],
	);

	const entries = await Promise.all(
		names.map(async (name): Promise<Screenshot | undefined> => {
			const file = path.join(directory, name);
			try {
				const info = await stat(file);
				if (!info.isFile()) return undefined;
				// Some filesystems report no birth time (0); fall back to mtime.
				const createdMs =
					info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs;
				return {
					path: file,
					name,
					bytes: info.size,
					createdAt: new Date(createdMs),
					size: await readImageSize(file),
				};
			} catch {
				// Removed since readdir, or unreadable.
				return undefined;
			}
		}),
	);

	return entries
		.filter((entry): entry is Screenshot => entry !== undefined)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Reads pixel dimensions from the PNG, JPEG or WebP header without decoding the image. */
export async function readImageSize(
	file: string,
): Promise<ImageSize | undefined> {
	const handle = await open(file, "r");
	try {
		const head = Buffer.alloc(30);
		const { bytesRead } = await handle.read(head, 0, head.length, 0);

		if (bytesRead >= 24 && head.readUInt32BE(0) === 0x89504e47) {
			return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
		}

		if (bytesRead >= 4 && head[0] === 0xff && head[1] === 0xd8) {
			return await readJpegSize(handle);
		}

		if (
			bytesRead >= 30 &&
			head.toString("ascii", 0, 4) === "RIFF" &&
			head.toString("ascii", 8, 12) === "WEBP"
		) {
			switch (head.toString("ascii", 12, 16)) {
				case "VP8 ":
					return {
						width: head.readUInt16LE(26) & 0x3fff,
						height: head.readUInt16LE(28) & 0x3fff,
					};
				case "VP8L": {
					const bits = head.readUInt32LE(21);
					return {
						width: (bits & 0x3fff) + 1,
						height: ((bits >>> 14) & 0x3fff) + 1,
					};
				}
				case "VP8X":
					return {
						width: head.readUIntLE(24, 3) + 1,
						height: head.readUIntLE(27, 3) + 1,
					};
			}
		}

		return undefined;
	} finally {
		await handle.close();
	}
}

/** Walks JPEG segments until a start-of-frame marker, which carries the dimensions. */
async function readJpegSize(
	handle: FileHandle,
): Promise<ImageSize | undefined> {
	const segment = Buffer.alloc(9);
	let offset = 2;

	for (;;) {
		const { bytesRead } = await handle.read(segment, 0, segment.length, offset);
		if (bytesRead < 4 || segment[0] !== 0xff) return undefined;

		const marker = segment[1];
		if (marker === 0xff) {
			// Fill byte before the actual marker.
			offset += 1;
			continue;
		}

		// SOF0-SOF15, excluding DHT (C4), JPG (C8) and DAC (CC).
		const isStartOfFrame =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (isStartOfFrame) {
			if (bytesRead < 9) return undefined;
			return {
				height: segment.readUInt16BE(5),
				width: segment.readUInt16BE(7),
			};
		}

		offset += 2 + segment.readUInt16BE(2);
	}
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Section title for the day a screenshot was taken: "Today", "Yesterday", or a date. */
export function dayLabel(date: Date, now = new Date()): string {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	return date.toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
		year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
	});
}
