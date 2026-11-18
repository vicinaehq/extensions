import type { EnteSecret, TotpSnapshot } from "./ente-contract";

/** Avoid repeating TOTP/HMAC work while an account remains in the same window. */
export function createSnapshotCache(
	generate: (secret: EnteSecret, timestamp: number) => TotpSnapshot,
): (secret: EnteSecret, timestamp: number) => TotpSnapshot {
	const cache = new WeakMap<
		EnteSecret,
		{ counter: number; snapshot: TotpSnapshot }
	>();

	return (secret, timestamp) => {
		const counter = Math.floor(timestamp / (secret.period * 1000));
		let entry = cache.get(secret);
		if (!entry || entry.counter !== counter) {
			entry = { counter, snapshot: generate(secret, timestamp) };
			cache.set(secret, entry);
		}

		const remaining =
			secret.period - (Math.floor(timestamp / 1000) % secret.period);
		return entry.snapshot.remaining === remaining
			? entry.snapshot
			: { ...entry.snapshot, remaining };
	};
}
