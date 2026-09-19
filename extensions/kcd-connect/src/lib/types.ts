/**
 * Wire types for the kcd IPC socket.
 *
 * Mirrors `internal/ipc/proto.go` and `internal/ipc/snapshot.go` in the kcd
 * source. `DeviceSummary` embeds the on-disk `DeviceInfo`, which is why it
 * mixes snake_case (`cert_fp`, `last_seen`) with the camelCase used elsewhere.
 * The shapes are modelled exactly as the daemon sends them.
 */

export type KcdRequest = {
	cmd: string;
	payload?: unknown;
};

export type KcdResponse = {
	ok: boolean;
	error?: string;
	data?: unknown;
};

export type BatteryStatus = {
	charge: number;
	charging: boolean;
	batteryAgeMs: number;
};

export type NowPlaying = {
	player: string;
	title: string;
	artist: string;
	album: string;
	albumArtUrl: string;
	url?: string;
	length: number;
	pos?: number;
	posAnchorMs?: number;
	isPlaying: boolean;
	volume?: number;
	canControl: boolean;
	canGoNext: boolean;
	canGoPrevious: boolean;
	canPause: boolean;
	canPlay: boolean;
	canSeek: boolean;
	playbackStatus: string;
};

export type MediaState = NowPlaying & {
	mediaAgeMs: number;
};

export type SignalStrength = {
	networkType: string;
	networkDetailedType?: string;
	signalStrength: number;
};

/** Keyed by SIM subscription id; most phones report a single entry. */
export type ConnectivityBody = {
	signalStrengths: Record<string, SignalStrength>;
};

export type DeviceState =
	| "PAIRED"
	| "UNPAIRED"
	| "PAIR_REQUESTED"
	| "PAIR_REQUESTED_BY_PEER";

export type DeviceSummary = {
	id: string;
	name: string;
	type: string;
	state: string;
	cert_fp: string;
	last_seen: string;
	connected: boolean;
	battery?: BatteryStatus;
	media?: MediaState;
	signal?: ConnectivityBody;
};

/** `status` returns its own camelCase device shape, distinct from DeviceSummary. */
export type StatusDevice = {
	id: string;
	name: string;
	type: string;
	state: string;
	connected: boolean;
	addr?: string;
	battery?: { charge: number; charging: boolean; ageMs: number };
	lastSeen?: string;
};

export type StatusResponse = {
	version: string;
	startedAt: string;
	uptimeHuman: string;
	socketPath: string;
	configPath: string;
	tcpPort?: number;
	plugins: string[];
	deviceCount: number;
	connectedCount: number;
	devices?: StatusDevice[];
};

export type PairListenResult = {
	deviceId: string;
	deviceName: string;
	verificationKey?: string;
	fingerprint?: string;
};

export type MprisRemotePlayer = {
	deviceId: string;
	player: string;
	title: string;
	artist: string;
	album: string;
	albumArtUrl: string;
	url?: string;
	length: number;
	pos: number;
	isPlaying: boolean;
	volume: number;
	playbackStatus: string;
	canSeek: boolean;
	canGoNext: boolean;
	canGoPrevious: boolean;
	canPlay: boolean;
	canPause: boolean;
	canControl: boolean;
};

export type SinkInfo = {
	name: string;
	description: string;
	volume: number;
	muted: boolean;
	maxVolume: number;
};

export type ContactSummary = {
	uid: string;
	name: string;
	phones?: string[];
	emails?: string[];
	timestamp: number;
};

export type StorageVolume = {
	name: string;
	path: string;
};

export type SftpBrowseResponse = {
	path?: string;
	volumes?: StorageVolume[];
};

export type ShareProgressPayload = {
	file: string;
	current: number;
	total: number;
};

export type ShareCompletePayload = {
	file: string;
	success: boolean;
	error?: string;
};

export type SnapshotPayload = {
	devices: DeviceSummary[];
};

export const EventType = {
	StateSnapshot: "state.snapshot",
	DeviceAdded: "device.added",
	DeviceRemoved: "device.removed",
	DeviceConnected: "device.connected",
	DeviceDisconnected: "device.disconnected",
	PairRequested: "pair.requested",
	PairAccepted: "pair.accepted",
	PairRejected: "pair.rejected",
	BatteryUpdate: "battery.update",
	ConnectivityUpdate: "connectivity.update",
	MprisUpdate: "mpris.update",
	ShareProgress: "share.progress",
	ShareComplete: "share.complete",
} as const;

export type KcdEvent = {
	type: string;
	/** Absent on `state.snapshot`, which describes every device at once. */
	deviceId?: string;
	timestamp: string;
	payload?: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDeviceSummary(value: unknown): value is DeviceSummary {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		typeof value.connected === "boolean"
	);
}

export function isKcdEvent(value: unknown): value is KcdEvent {
	return isRecord(value) && typeof value.type === "string";
}

export function asSnapshot(payload: unknown): DeviceSummary[] | null {
	if (!isRecord(payload) || !Array.isArray(payload.devices)) return null;
	return payload.devices.filter(isDeviceSummary);
}
