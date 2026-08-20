import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, launchDetached } from "../backends/utils";

// Spectacle's own annotation editor, opened on an existing capture with -E.
// It is the natural editor on KDE, where Spectacle is already the capture tool.
export const spectacleAnnotator: AnnotatorBackend = {
	id: "spectacle",
	displayName: "Spectacle",
	mode: "manual",

	isAvailable: () => isCommandAvailable("spectacle"),

	annotate: async (imagePath: string) => {
		await launchDetached("spectacle", ["-E", imagePath]);
	},
};
