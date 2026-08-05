import { execSync } from "node:child_process";
import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, shellEscape } from "../backends/utils";

export const swappyAnnotator: AnnotatorBackend = {
	id: "swappy",
	displayName: "swappy",
	mode: "auto",

	isAvailable: () => isCommandAvailable("swappy"),

	annotate: async (imagePath: string) => {
		const p = shellEscape(imagePath);
		execSync(`swappy -f "${p}" -o "${p}"`);
	},
};
