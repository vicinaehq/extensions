import { z } from "zod/v4-mini";

interface Glyph {
	char: string;
	code: string;
}

interface SerializedIconIndex {
	id: string;
	pack: string;
	char: string;
	code: string;
	displayName: string;
	packLabel: string;
	searchTokens: number[];
}

interface IconIndexFile {
	dictionary: string[];
	icons: SerializedIconIndex[];
}

type GlyphRecord = Record<string, Glyph>;

type IconIndex = Omit<SerializedIconIndex, "searchTokens"> & {
	searchTokens: string[];
};

const glyphSchema = z.object({
	char: z.string(),
	code: z.string(),
});

const serializedIconIndexSchema = z.object({
	id: z.string(),
	pack: z.string(),
	char: z.string(),
	code: z.string(),
	displayName: z.string(),
	packLabel: z.string(),
	searchTokens: z.array(z.number()),
});

const iconIndexFileSchema = z.object({
	dictionary: z.array(z.string()),
	icons: z.array(serializedIconIndexSchema),
});

const glyphnamesSourceSchema = z.record(z.string(), z.unknown());

function parseGlyphnames(input: unknown): GlyphRecord {
	const source = glyphnamesSourceSchema.parse(input);
	const glyphnames: GlyphRecord = {};

	for (const [id, value] of Object.entries(source)) {
		if (id === "METADATA") {
			continue;
		}

		const glyph = glyphSchema.parse(value);
		glyphnames[id] = {
			char: glyph.char,
			code: glyph.code,
		};
	}

	return glyphnames;
}

function parseIconIndexFile(input: unknown): IconIndexFile {
	const parsed = iconIndexFileSchema.parse(input);

	return {
		dictionary: [...parsed.dictionary],
		icons: parsed.icons.map((icon) => ({
			id: icon.id,
			pack: icon.pack,
			char: icon.char,
			code: icon.code,
			displayName: icon.displayName,
			packLabel: icon.packLabel,
			searchTokens: [...icon.searchTokens],
		})),
	};
}

export { parseGlyphnames, parseIconIndexFile };
export type { GlyphRecord, IconIndex, SerializedIconIndex };
