import { exec } from "node:child_process";
import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, shellEscape } from "../backends/utils";

export const pintaAnnotator: AnnotatorBackend = {
	id: "pinta",
	displayName: "Pinta",
	mode: "manual",

	isAvailable: () => isCommandAvailable("pinta"),

	annotate: async (imagePath: string) => {
		await new Promise<void>((resolve) => {
			exec(`pinta "${shellEscape(imagePath)}"`, () => resolve());
		});
	},
};
