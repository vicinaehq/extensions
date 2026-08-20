import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, run } from "../backends/utils";

export const sattyAnnotator: AnnotatorBackend = {
	id: "satty",
	displayName: "Satty",
	mode: "auto",

	isAvailable: () => isCommandAvailable("satty"),

	annotate: async (imagePath: string) => {
		run("satty", [
			"--filename",
			imagePath,
			"--output-filename",
			imagePath,
			"--early-exit",
		]);
	},
};
