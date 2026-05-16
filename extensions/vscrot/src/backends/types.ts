export type CaptureMode = "area" | "window" | "monitor" | "full";

export interface CaptureBackend {
	readonly id: string;
	readonly displayName: string;
	readonly supportedModes: CaptureMode[];
	isAvailable(): boolean;
	capture(
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
	): Promise<void>;
}
