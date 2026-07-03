import { LocalStorage } from "@vicinae/api";
import { ALL_BACKENDS, getBackend } from "../backends";
import { ALL_ANNOTATORS, getAnnotator } from "../annotators";
import type { CaptureBackend } from "../backends/types";
import type { AnnotatorBackend } from "../annotators/types";

const CAPTURE_KEY = "active_capture_tool";
const ANNOTATE_KEY = "active_annotation_tool";

export const getInstalledBackends = (): CaptureBackend[] =>
	ALL_BACKENDS.filter((b) => b.isAvailable());

export const getInstalledAnnotators = (): AnnotatorBackend[] =>
	ALL_ANNOTATORS.filter((a) => a.isAvailable());

/** Resolves the active backend: LocalStorage → preference → auto-detect. */
export const resolveBackend = async (
	prefToolId: string,
): Promise<CaptureBackend | null> => {
	const saved = await LocalStorage.getItem<string>(CAPTURE_KEY);
	const id = saved ?? prefToolId;
	const backend = getBackend(id);
	// If the saved tool is no longer installed, fall back to auto-detect
	if (backend && !backend.isAvailable()) return getBackend("auto");
	return backend;
};

/** Resolves the active annotator: LocalStorage → preference → auto-detect. */
export const resolveAnnotator = async (
	prefToolId: string,
): Promise<AnnotatorBackend | null> => {
	const saved = await LocalStorage.getItem<string>(ANNOTATE_KEY);
	const id = saved ?? prefToolId;
	return getAnnotator(id);
};

export const saveBackendChoice = (id: string): Promise<void> =>
	LocalStorage.setItem(CAPTURE_KEY, id);

export const saveAnnotatorChoice = (id: string): Promise<void> =>
	LocalStorage.setItem(ANNOTATE_KEY, id);
