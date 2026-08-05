import { execSync } from "node:child_process";
import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, shellEscape } from "../backends/utils";

export const sattyAnnotator: AnnotatorBackend = {
	id: "satty",
	displayName: "Satty",
	mode: "auto",

	isAvailable: () => isCommandAvailable("satty"),

	annotate: async (imagePath: string) => {
		const p = shellEscape(imagePath);
		execSync(
			`satty --filename "${p}" --output-filename "${p}" --early-exit`,
		);
	},
};
