import { z } from "zod/v4-mini";

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

type SerializedIconIndex = z.infer<typeof serializedIconIndexSchema>;
type IconIndexFile = z.infer<typeof iconIndexFileSchema>;
type IconIndex = Omit<SerializedIconIndex, "searchTokens"> & {
	searchTokens: string[];
};

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

export { parseIconIndexFile };
export type { IconIndex, SerializedIconIndex };
