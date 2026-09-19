import { request } from "./socket";
import type {
	ContactSummary,
	DeviceSummary,
	MprisRemotePlayer,
	PairListenResult,
	SftpBrowseResponse,
	SinkInfo,
	StatusResponse,
} from "./types";

/** One function per IPC route we use. Route names come from kcd's proto.go. */

export function listDevices(): Promise<DeviceSummary[]> {
	return request<DeviceSummary[]>("devices").then((d) => d ?? []);
}

export function getStatus(): Promise<StatusResponse> {
	return request<StatusResponse>("status");
}

export function ping(deviceId: string): Promise<void> {
	return request<void>("ping", { deviceId });
}

export function ringDevice(deviceId: string): Promise<void> {
	return request<void>("findmyphone", { deviceId });
}

export function lockDevice(deviceId: string): Promise<void> {
	return request<void>("lock", { deviceId });
}

export function unlockDevice(deviceId: string): Promise<void> {
	return request<void>("unlock", { deviceId });
}

/**
 * Queues a file transfer. Returns as soon as the invite packet is sent — the
 * bytes move in a background goroutine, so completion is only observable
 * through the `share.progress` / `share.complete` events.
 */
export function shareFile(deviceId: string, filePath: string): Promise<void> {
	return request<void>("share", { deviceId, filePath });
}

/** Asks the daemon to read the system clipboard and push it to the device. */
export function pushClipboard(deviceId: string): Promise<void> {
	return request<void>("clipboard_push", { deviceId });
}

export function sendSms(
	deviceId: string,
	phoneNumber: string,
	message: string,
): Promise<void> {
	return request<void>("send_sms", { deviceId, phoneNumber, message });
}

export function listContacts(deviceId: string): Promise<ContactSummary[]> {
	return request<ContactSummary[]>("contacts_list", { deviceId }).then(
		(c) => c ?? [],
	);
}

export function syncContacts(deviceId: string): Promise<void> {
	return request<void>("contacts_sync", { deviceId });
}

export function listRemotePlayers(): Promise<MprisRemotePlayer[]> {
	return request<{ players?: MprisRemotePlayer[] }>("mpris_remote").then(
		(r) => r?.players ?? [],
	);
}

export type MprisAction = {
	deviceId: string;
	player: string;
	action?: string;
	volume?: number;
	seek?: number;
};

export function mprisAction(action: MprisAction): Promise<void> {
	return request<void>("mpris_action", action);
}

export function listRemoteSinks(deviceId: string): Promise<SinkInfo[]> {
	return request<SinkInfo[]>("remote_volume_list", { deviceId }).then(
		(s) => s ?? [],
	);
}

export function setRemoteVolume(
	deviceId: string,
	name: string,
	volume: number,
): Promise<void> {
	return request<void>("remote_volume_set", { deviceId, name, volume });
}

export function setRemoteMuted(
	deviceId: string,
	name: string,
	muted: boolean,
): Promise<void> {
	return request<void>("remote_volume_mute", { deviceId, name, muted });
}

export function mountSftp(deviceId: string): Promise<void> {
	return request<void>("sftp_mount", { deviceId });
}

export function unmountSftp(deviceId: string): Promise<void> {
	return request<void>("sftp_unmount", { deviceId });
}

export function browseSftp(
	deviceId: string,
	volume?: string,
): Promise<SftpBrowseResponse> {
	return request<SftpBrowseResponse>("sftp_browse", { deviceId, volume });
}

export function pairDevice(deviceId: string): Promise<void> {
	return request<void>("pair", { deviceId });
}

export function unpairDevice(deviceId: string): Promise<void> {
	return request<void>("unpair", { deviceId });
}

/**
 * Blocks until an incoming pair request arrives or the daemon's pairing
 * timeout (default 30s) elapses, so it needs a longer deadline than the rest.
 */
export function listenForPairing(): Promise<PairListenResult> {
	return request<PairListenResult>("pair_listen", undefined, {
		timeoutMs: 45_000,
	});
}

export function startBroadcast(): Promise<void> {
	return request<void>("broadcast_start");
}

export function stopBroadcast(): Promise<void> {
	return request<void>("broadcast_stop");
}
