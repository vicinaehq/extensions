import { Color } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { getTotp, type PassItem } from "./pass-cli";

export function totpItemKey(item: PassItem): string {
	return `${item.shareId}:${item.itemId}`;
}

export function totpTimerColor(seconds: number): Color {
	if (seconds > 10) return Color.Green;
	if (seconds > 5) return Color.Yellow;
	return Color.Red;
}

function currentStep(): number {
	return Math.floor(Date.now() / 30_000);
}

function secondsRemaining(): number {
	return 30 - (Math.floor(Date.now() / 1000) % 30);
}

export function useTotpCodes(items: PassItem[]): {
	codes: Record<string, string>;
	remaining: number;
	refreshing: boolean;
	refreshError?: string;
	refresh: () => Promise<void>;
} {
	const [codes, setCodes] = useState<Record<string, string>>({});
	const [remaining, setRemaining] = useState(secondsRemaining());
	const [refreshing, setRefreshing] = useState(false);
	const [refreshError, setRefreshError] = useState<string>();
	const itemsRef = useRef<PassItem[]>(items);
	const stepRef = useRef(currentStep());
	const refreshingRef = useRef(false);
	const queuedRefreshRef = useRef(false);
	const mountedRef = useRef(true);
	const itemsVersionRef = useRef(0);

	const refresh = useCallback(
		async (source: PassItem[] = itemsRef.current): Promise<void> => {
			if (refreshingRef.current) {
				queuedRefreshRef.current = true;
				return;
			}
			refreshingRef.current = true;
			if (mountedRef.current) setRefreshing(true);
			const requestStep = currentStep();
			const requestItemsVersion = itemsVersionRef.current;
			try {
				const results = await Promise.all(
					source
						.filter((item) => item.hasTotp)
						.map(async (item) => {
							try {
								return {
									entry: [totpItemKey(item), await getTotp(item)] as const,
									failed: false,
								};
							} catch {
								return { entry: undefined, failed: true };
							}
						}),
				);
				const failedCount = results.filter((result) => result.failed).length;
				if (
					requestStep !== currentStep() ||
					requestItemsVersion !== itemsVersionRef.current
				) {
					queuedRefreshRef.current = true;
				} else if (mountedRef.current) {
					setRefreshError(
						failedCount > 0
							? `Unable to refresh ${failedCount} TOTP code${failedCount === 1 ? "" : "s"}.`
							: undefined,
					);
					setCodes(
						Object.fromEntries(
							results.flatMap((result) => (result.entry ? [result.entry] : [])),
						),
					);
				}
			} finally {
				refreshingRef.current = false;
				if (mountedRef.current) setRefreshing(false);
				if (queuedRefreshRef.current && mountedRef.current) {
					queuedRefreshRef.current = false;
					void refresh();
				}
			}
		},
		[],
	);

	useEffect(() => {
		itemsRef.current = items;
		itemsVersionRef.current += 1;
		void refresh(items);
	}, [items, refresh]);

	useEffect(() => {
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		// Only tick when there is at least one TOTP item; otherwise the interval
		// is pure idle work (the list-vaults command passes every item).
		if (items.length === 0) return;
		const interval = setInterval(() => {
			setRemaining(secondsRemaining());
			const nextStep = currentStep();
			if (nextStep !== stepRef.current) {
				stepRef.current = nextStep;
				setCodes({});
				setRefreshError(undefined);
				void refresh();
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [items.length, refresh]);

	return { codes, remaining, refreshing, refreshError, refresh };
}
