import { useCallback, useEffect, useRef, useState } from "react";
import { getPlayerInfo, type PlayerInfo } from "./kaset";
import { toastError } from "./feedback";

type Options = {
	/** How often to ask Kaset for fresh state. */
	pollMs?: number;
	/** How often to re-render so the interpolated position advances. */
	tickMs?: number;
};

export type Player = {
	info: PlayerInfo | null;
	/** `info.position` advanced by the time elapsed since we read it. */
	position: number;
	error: unknown;
	isLoading: boolean;
	/**
	 * Whether to stop trusting what is on screen. A single failed read keeps the
	 * last good state, so a one-off timeout does not flash an error at the user;
	 * a second consecutive failure, or a failure with nothing to fall back on,
	 * means the view should explain itself instead of showing stale data.
	 */
	unavailable: boolean;
	refresh: () => void;
	/**
	 * Run a command against Kaset. Polling is suspended for the duration, and the
	 * state the command reads back is applied directly, so the view never flashes
	 * the value it had before the command ran.
	 */
	perform: (action: () => Promise<PlayerInfo | void>) => Promise<void>;
};

export function usePlayer({
	pollMs = 2_000,
	tickMs = 1_000,
}: Options = {}): Player {
	const [info, setInfo] = useState<PlayerInfo | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [failures, setFailures] = useState(0);
	const [, setTick] = useState(0);

	const readAt = useRef(Date.now());
	const busy = useRef(false);
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const apply = useCallback((next: PlayerInfo) => {
		if (!mounted.current) return;
		readAt.current = Date.now();
		setInfo(next);
		setError(null);
		setFailures(0);
		setIsLoading(false);
	}, []);

	const read = useCallback(async () => {
		if (busy.current) return;
		try {
			apply(await getPlayerInfo());
		} catch (caught) {
			if (!mounted.current) return;
			setError(caught);
			setFailures((n) => n + 1);
			setIsLoading(false);
		}
	}, [apply]);

	useEffect(() => {
		void read();
		if (pollMs <= 0) return;
		const handle = setInterval(() => void read(), pollMs);
		return () => clearInterval(handle);
	}, [read, pollMs]);

	useEffect(() => {
		if (tickMs <= 0) return;
		const handle = setInterval(() => setTick((value) => value + 1), tickMs);
		return () => clearInterval(handle);
	}, [tickMs]);

	const perform = useCallback(
		async (action: () => Promise<PlayerInfo | void>) => {
			busy.current = true;
			try {
				const next = await action();
				if (next) apply(next);
			} catch (caught) {
				await toastError(caught);
				if (mounted.current) setError(caught);
			} finally {
				busy.current = false;
				if (mounted.current) void read();
			}
		},
		[apply, read],
	);

	const refresh = useCallback(() => {
		void read();
	}, [read]);

	const position =
		info === null
			? 0
			: info.state === "playing"
				? Math.min(
						info.duration || Number.POSITIVE_INFINITY,
						info.position + (Date.now() - readAt.current) / 1000,
					)
				: info.position;

	const unavailable = error !== null && (info === null || failures >= 2);

	return { info, position, error, isLoading, unavailable, refresh, perform };
}
