import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, launchDetached } from "../backends/utils";

export const gimpAnnotator: AnnotatorBackend = {
	id: "gimp",
	displayName: "GIMP",
	mode: "manual",

	isAvailable: () => isCommandAvailable("gimp"),

	annotate: async (imagePath: string) => {
		await launchDetached("gimp", [imagePath]);
	},
};
