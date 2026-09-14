declare module "v4l2camera" {
	export interface CameraFormat {
		formatName: string;
		format: number;
		width: number;
		height: number;
		interval: { numerator: number; denominator: number };
	}

	export interface CameraControl {
		id: number;
		name: string;
		type: string;
		max: number;
		min: number;
		step: number;
		default: number;
		flags: number;
		menu?: Array<{ index: number; name: string }>;
	}

	export class Camera {
		constructor(device: string);
		device: string;
		width: number;
		height: number;
		formats: CameraFormat[];
		controls: CameraControl[];
		configGet(): CameraFormat;
		configSet(format: Partial<CameraFormat>): void;
		start(): void;
		stop(afterStopped?: () => void): void;
		capture(afterCaptured: (success: boolean) => void): void;
		frameRaw(): Uint8Array;
		toRGB(): Uint8Array;
		toYUYV(): Uint8Array;
		controlGet(id: number): number;
		controlSet(id: number, value: number): void;
	}
}
