import { z } from "zod/v4-mini";

const recentIconSchema = z.object({
	id: z.string(),
	char: z.string(),
	code: z.string(),
	hexCode: z.string(),
	htmlEntity: z.string(),
	displayName: z.string(),
	nerdFontId: z.string(),
	packLabel: z.string(),
	iconPath: z.string(),
});

const recentIconsSchema = z.array(recentIconSchema);

type RecentIcon = {
	id: string;
	char: string;
	code: string;
	hexCode: string;
	htmlEntity: string;
	displayName: string;
	nerdFontId: string;
	packLabel: string;
	iconPath: string;
};

function parseRecentIconsJson(cached: string | null | undefined): RecentIcon[] {
	if (!cached) {
		return [];
	}

	try {
		const parsed: unknown = JSON.parse(cached);
		const validated = recentIconsSchema.safeParse(parsed);
		if (validated.success) {
			return validated.data;
		}
		return [];
	} catch {
		return [];
	}
}

export { parseRecentIconsJson, recentIconSchema, recentIconsSchema };
export type { RecentIcon };
