export type AnnotationMode = "auto" | "manual";

export interface AnnotatorBackend {
	readonly id: string;
	readonly displayName: string;
	/** "auto" = blocks until editor closes and writes output; "manual" = opens editor non-blocking */
	readonly mode: AnnotationMode;
	isAvailable(): boolean;
	annotate(imagePath: string): Promise<void>;
}
