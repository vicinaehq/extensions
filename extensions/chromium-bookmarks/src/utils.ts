import * as fsp from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import { Color, Icon } from "@vicinae/api";

export const extractHost = (url: string): string | null => {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch (_) {
		return null;
	}
};

export const configHome = () => {
	return process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
};


export const expandHome = (p: string) => {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
	return p;
};

export const safeAccess = async (path: string, mode?: number) => {
	try {
		await fsp.access(path, mode);
		return true;
	} catch (_) {
		return false;
	}
};

export const faviconIcon = ({
	url,
	favorite,
	enabled,
}: {
	url: string;
	favorite: boolean;
	enabled: boolean;
}) => {
	const defaultIcon = favorite
		? {
				source: Icon.Star,
				tintColor: "#fffac1",
			}
		: {
		source: Icon.Bookmark,
	};

	if (!enabled) {
		return defaultIcon;
	}

	const host = extractHost(url);

	if (!host) {
		return defaultIcon;
	}

	return {
		source: `https://icons.duckduckgo.com/ip3/${host}.ico`,
		fallback: favorite ? Icon.Star : Icon.Bookmark,
	};
};
