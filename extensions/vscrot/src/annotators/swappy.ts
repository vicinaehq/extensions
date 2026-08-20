import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, run } from "../backends/utils";

export const swappyAnnotator: AnnotatorBackend = {
	id: "swappy",
	displayName: "swappy",
	mode: "auto",

	isAvailable: () => isCommandAvailable("swappy"),

	annotate: async (imagePath: string) => {
		run("swappy", ["-f", imagePath, "-o", imagePath]);
	},
};
