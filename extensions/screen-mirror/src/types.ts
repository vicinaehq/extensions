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

export type ActiveMirrorSession = {
	pid?: number;
	source: string;
	target: string;
};

export type ScreenMirrorProps = {
	source: string;
	target: string;
	setActiveMirror?: (session: ActiveMirrorSession | null) => void;
};
