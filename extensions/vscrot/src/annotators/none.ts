import type { AnnotatorBackend } from "./types";

export const noneAnnotator: AnnotatorBackend = {
	id: "none",
	displayName: "None",
	mode: "manual",

	isAvailable: () => true,

	annotate: async (_imagePath: string) => {},
};
