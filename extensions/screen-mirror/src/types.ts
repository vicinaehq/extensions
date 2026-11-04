export type OutputMode = {
	width: number;
	height: number;
	refresh: number;
	preferred: boolean;
	current: boolean;
};

export type Output = {
	name: string;
	description: string;
	make: string;
	model: string;
	serial: string | null;
	physical_size: {
		width: number;
		height: number;
	};
	enabled: boolean;
	modes: OutputMode[];
	position: {
		x: number;
		y: number;
	};
	transform: string;
	scale: number;
	adaptive_sync: boolean;
};

export type ScalingMode = "fit" | "cover" | "exact";

export type Rotation = "none" | "90cw" | "180cw" | "270cw";

export type Flip = "none" | "flipX" | "flipY";

export type MirrorOptions = {
	scaling: ScalingMode;
	rotation: Rotation;
	flip: Flip;
	showCursor: boolean;
	region: string;
};

export const DEFAULT_MIRROR_OPTIONS: MirrorOptions = {
	scaling: "fit",
	rotation: "none",
	flip: "none",
	showCursor: true,
	region: "",
};

export type ActiveMirrorSession = {
	pid?: number;
	source: string;
	target: string;
	options?: MirrorOptions;
};

export type ScreenMirrorProps = {
	source: string;
	target: string;
	options: MirrorOptions;
	setActiveMirror?: (session: ActiveMirrorSession | null) => void;
};

export type SavedFormState = {
	source: string;
	target: string;
	options: MirrorOptions;
};
