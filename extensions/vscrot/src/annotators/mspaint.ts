import { exec } from "node:child_process";
import type { AnnotatorBackend } from "./types";

export const mspaintAnnotator: AnnotatorBackend = {
	id: "mspaint",
	displayName: "Paint",
	mode: "manual",

	isAvailable: () => process.platform === "win32",

	annotate: async (imagePath: string) => {
		await new Promise<void>((resolve) => {
			exec(`mspaint.exe "${imagePath}"`, () => resolve());
		});
	},
};
