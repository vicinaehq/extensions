import * as fsp from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";

export const extractHost = (url: string): string | null => {
	try {
		return new URL(url).hostname;
	} catch (_) {
		return null;
	}
};

export const configHome = () => {
	return process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
};

export const safeAccess = async (path: string, mode?: number) => {
	try {
		await fsp.access(path, mode);
		return true;
	} catch (_) {
		return false;
	}
};
