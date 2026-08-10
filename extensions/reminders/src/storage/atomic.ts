import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { chmod, open, rename, rm } from "node:fs/promises";
import path from "node:path";

export type AtomicWriteHooks = {
	beforeRename?: (temporaryPath: string) => Promise<void> | void;
};

export async function atomicWriteFile(
	targetPath: string,
	contents: string | Uint8Array,
	mode = 0o600,
	hooks: AtomicWriteHooks = {},
): Promise<void> {
	const directory = path.dirname(targetPath);
	const temporaryPath = path.join(directory, `.${path.basename(targetPath)}.${randomUUID()}.tmp`);
	let handle: FileHandle | undefined;
	try {
		handle = await open(
			temporaryPath,
			constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
			mode,
		);
		await handle.writeFile(contents);
		await handle.sync();
		await handle.close();
		handle = undefined;
		await hooks.beforeRename?.(temporaryPath);
		await rename(temporaryPath, targetPath);
		await chmod(targetPath, mode);
		const directoryHandle = await open(directory, constants.O_RDONLY);
		try {
			await directoryHandle.sync();
		} finally {
			await directoryHandle.close();
		}
	} catch (error) {
		await handle?.close().catch(() => undefined);
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

export async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
	await atomicWriteFile(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}
