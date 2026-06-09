import { exec } from "node:child_process";
import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, shellEscape } from "../backends/utils";

export const gimpAnnotator: AnnotatorBackend = {
	id: "gimp",
	displayName: "GIMP",
	mode: "manual",

	isAvailable: () => isCommandAvailable("gimp"),

	annotate: async (imagePath: string) => {
		await new Promise<void>((resolve) => {
			exec(`gimp "${shellEscape(imagePath)}"`, () => resolve());
		});
	},
};
