import * as fsp from "node:fs/promises";

export const extractHost = (url: string): string | null => {
	try {
		return new URL(url).hostname;
	} catch (_) {
		return null;
	}
};

export const safeAccess = async (path: string, mode?: number) => {
	try {
		await fsp.access(path, mode);
		return true;
	} catch (_) {
		return false;
	}
};
