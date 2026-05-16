import { execSync } from "node:child_process";
import type { AnnotatorBackend } from "./types";
import { isCommandAvailable } from "../backends/utils";

export const swappyAnnotator: AnnotatorBackend = {
	id: "swappy",
	displayName: "swappy",
	mode: "auto",

	isAvailable: () => isCommandAvailable("swappy"),

	annotate: async (imagePath: string) => {
		execSync(`swappy -f "${imagePath}" -o "${imagePath}"`);
	},
};
