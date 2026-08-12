import type { PackageSummary } from "./api";

export const singleLine = (text: string | null | undefined) =>
	text?.replace(/\s+/g, " ").trim() ?? "";

const hslToHex = (h: number, s: number, l: number) => {
	const sat = s / 100;
	const light = l / 100;
	const channel = (n: number) => {
		const k = (n + h / 30) % 12;
		const value =
			light -
			sat *
				Math.min(light, 1 - light) *
				Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(255 * value)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${channel(0)}${channel(8)}${channel(4)}`;
};

export const overlayColor = (name: string) => {
	let hash = 0;
	for (const char of name) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	return hslToHex(hash % 360, 65, 60);
};

const ACCOUNT_CATEGORIES = new Set(["acct-user", "acct-group"]);

export const partitionAccountPackages = <T extends PackageSummary>(
	packages: T[],
) => {
	const main: T[] = [];
	const accounts: T[] = [];

	for (const pkg of packages) {
		(ACCOUNT_CATEGORIES.has(pkg.category) ? accounts : main).push(pkg);
	}

	return { main, accounts };
};

const decodeEntities = (text: string) =>
	text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");

export const htmlToMarkdown = (html: string) =>
	decodeEntities(
		html
			.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, "[$2]($1)")
			.replace(/<(strong|b)>(.*?)<\/\1>/gis, "**$2**")
			.replace(/<(em|i)>(.*?)<\/\1>/gis, "*$2*")
			.replace(/<code>(.*?)<\/code>/gis, "`$1`")
			.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gis, "\n\n## $2\n\n")
			.replace(/<li[^>]*>(.*?)<\/li>/gis, "\n- $1")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/p>/gi, "\n\n")
			.replace(/<[^>]+>/g, ""),
	)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
