import type { AnnotatorBackend } from "./types";
import { launchDetached } from "../backends/utils";

export const mspaintAnnotator: AnnotatorBackend = {
	id: "mspaint",
	displayName: "Paint",
	mode: "manual",

	isAvailable: () => process.platform === "win32",

	annotate: async (imagePath: string) => {
		await launchDetached("mspaint.exe", [imagePath]);
	},
};
