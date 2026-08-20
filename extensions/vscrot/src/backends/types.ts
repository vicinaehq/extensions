export type CaptureMode = "area" | "window" | "monitor" | "full";

export type CaptureOptions = {
	/**
	 * Whether the capture tool may show its own notification. Suppressed when
	 * Vicinae owns the preview, because that notification would point at a
	 * temporary file the extension deletes.
	 */
	notify?: boolean;
};

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
		options?: CaptureOptions,
	): Promise<void>;
}
