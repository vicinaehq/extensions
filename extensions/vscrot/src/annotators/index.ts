import { sattyAnnotator } from "./satty";
import { swappyAnnotator } from "./swappy";
import { gimpAnnotator } from "./gimp";
import { pintaAnnotator } from "./pinta";
import { mspaintAnnotator } from "./mspaint";
import { noneAnnotator } from "./none";
import type { AnnotatorBackend } from "./types";

export type { AnnotatorBackend, AnnotationMode } from "./types";

// Priority order for auto-detection (auto-reload tools first)
export const ALL_ANNOTATORS: AnnotatorBackend[] = [
	sattyAnnotator,
	swappyAnnotator,
	gimpAnnotator,
	pintaAnnotator,
	mspaintAnnotator,
];

export const getAnnotator = (id: string): AnnotatorBackend | null => {
	if (id === "none") return noneAnnotator;
	if (id === "auto") return ALL_ANNOTATORS.find((a) => a.isAvailable()) ?? null;
	return ALL_ANNOTATORS.find((a) => a.id === id) ?? null;
};
