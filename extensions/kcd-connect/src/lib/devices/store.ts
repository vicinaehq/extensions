import { useCallback, useEffect, useRef, useState } from "react";
import { listDevices } from "../client";
import { errorMessage, isDaemonUnavailable } from "../errors";
import { openWatch, type WatchHandle } from "../socket";
import {
	asSnapshot,
	type BatteryStatus,
	type ConnectivityBody,
	type DeviceSummary,
	EventType,
	isRecord,
	type KcdEvent,
	type NowPlaying,
} from "../types";
import { getDefaultDeviceId, setDefaultDeviceId } from "./target";

export type DeviceStore = {
	devices: DeviceSummary[];
	isLoading: boolean;
	/** True once we know the daemon is not reachable; views show a fix hint. */
	daemonDown: boolean;
	error?: string;
	defaultDeviceId?: string;
	refresh: () => Promise<void>;
	setDefault: (deviceId: string) => Promise<void>;
};

function patch(
	devices: DeviceSummary[],
	id: string,
	change: Partial<DeviceSummary>,
): DeviceSummary[] {
	return devices.map((d) => (d.id === id ? { ...d, ...change } : d));
}

/**
 * The single source of device state for every view.
 *
 * One `watch` connection does all the work: the daemon answers it with a full
 * `state.snapshot` covering every device it knows — online and offline, with
 * cached battery, media and signal — and then pushes changes. That removes the
 * usual bootstrap fetch, the polling loop, and the hydration race between them.
 *
 * High-frequency events are applied in place. Structural changes (a device
 * appearing, or pairing state moving) trigger a cheap re-list instead, because
 * their payloads carry less than a full DeviceSummary.
 */
export function useDevices(): DeviceStore {
	const [devices, setDevices] = useState<DeviceSummary[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [daemonDown, setDaemonDown] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [defaultDeviceId, setDefaultId] = useState<string | undefined>();

	const watchRef = useRef<WatchHandle | null>(null);
	const mountedRef = useRef(true);
	const knownIdsRef = useRef<Set<string>>(new Set());

	// Mirrors the ids currently in state so event handling can tell an update
	// to a known device from the first sighting of a new one.
	knownIdsRef.current = new Set(devices.map((d) => d.id));

	const refresh = useCallback(async () => {
		try {
			const list = await listDevices();
			if (!mountedRef.current) return;
			setDevices(list);
			setDaemonDown(false);
			setError(undefined);
		} catch (err) {
			if (!mountedRef.current) return;
			setDaemonDown(isDaemonUnavailable(err));
			setError(errorMessage(err));
		} finally {
			if (mountedRef.current) setIsLoading(false);
		}
	}, []);

	const setDefault = useCallback(async (deviceId: string) => {
		await setDefaultDeviceId(deviceId);
		if (mountedRef.current) setDefaultId(deviceId);
	}, []);

	const applyEvent = useCallback(
		(event: KcdEvent) => {
			if (event.type === EventType.StateSnapshot) {
				const snapshot = asSnapshot(event.payload);
				if (snapshot) {
					setDevices(snapshot);
					setDaemonDown(false);
					setError(undefined);
					setIsLoading(false);
				}
				return;
			}

			const id = event.deviceId;
			if (!id) return;

			switch (event.type) {
				case EventType.DeviceConnected:
					// The event carries only id/name/type, so a device we have
					// never seen needs a full summary fetched for it.
					if (!knownIdsRef.current.has(id)) {
						void refresh();
						return;
					}
					setDevices((current) => patch(current, id, { connected: true }));
					return;

				case EventType.DeviceDisconnected:
					setDevices((current) => patch(current, id, { connected: false }));
					return;

				case EventType.BatteryUpdate:
					if (isRecord(event.payload)) {
						setDevices((current) =>
							patch(current, id, {
								battery: event.payload as BatteryStatus,
							}),
						);
					}
					return;

				case EventType.ConnectivityUpdate:
					if (isRecord(event.payload)) {
						setDevices((current) =>
							patch(current, id, {
								signal: event.payload as ConnectivityBody,
							}),
						);
					}
					return;

				case EventType.MprisUpdate:
					if (isRecord(event.payload)) {
						// A pushed update is current by definition, so its age is zero.
						setDevices((current) =>
							patch(current, id, {
								media: { ...(event.payload as NowPlaying), mediaAgeMs: 0 },
							}),
						);
					}
					return;

				case EventType.DeviceAdded:
				case EventType.DeviceRemoved:
				case EventType.PairAccepted:
				case EventType.PairRejected:
				case EventType.PairRequested:
					void refresh();
					return;

				default:
					return;
			}
		},
		[refresh],
	);

	useEffect(() => {
		mountedRef.current = true;
		void getDefaultDeviceId().then((id) => {
			if (mountedRef.current) setDefaultId(id);
		});

		watchRef.current = openWatch([], {
			onEvent: applyEvent,
			onError: (err) => {
				if (!mountedRef.current) return;
				setDaemonDown(isDaemonUnavailable(err));
				setError(errorMessage(err));
				setIsLoading(false);
			},
			onClose: () => {
				// The stream died on its own; fall back to a one-shot list so the
				// view shows something current rather than freezing on stale state.
				if (mountedRef.current) void refresh();
			},
		});

		return () => {
			mountedRef.current = false;
			watchRef.current?.close();
			watchRef.current = null;
		};
	}, [applyEvent, refresh]);

	return {
		devices,
		isLoading,
		daemonDown,
		error,
		defaultDeviceId,
		refresh,
		setDefault,
	};
}
