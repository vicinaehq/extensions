export type CaptureMode = "area" | "window" | "monitor" | "full";

export interface CaptureBackend {
	readonly id: string;
	readonly displayName: string;
	readonly supportedModes: CaptureMode[];
	isAvailable(): boolean;
	/**
	 * Displays this backend can target, when it can enumerate them itself.
	 * The returned `id` is what the monitor command passes back as `outputName`.
	 */
	listDisplays?(): Promise<{ id: string; name: string }[]>;
	capture(
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
	): Promise<void>;
}
