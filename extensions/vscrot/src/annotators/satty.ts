import { execSync } from "node:child_process";
import type { AnnotatorBackend } from "./types";
import { isCommandAvailable } from "../backends/utils";

export const sattyAnnotator: AnnotatorBackend = {
	id: "satty",
	displayName: "Satty",
	mode: "auto",

	isAvailable: () => isCommandAvailable("satty"),

	annotate: async (imagePath: string) => {
		execSync(
			`satty --filename "${imagePath}" --output-filename "${imagePath}" --early-exit`,
		);
	},
};
