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
	refresh: () => Promise<void>;
} {
	const [codes, setCodes] = useState<Record<string, string>>({});
	const [remaining, setRemaining] = useState(secondsRemaining());
	const [refreshing, setRefreshing] = useState(false);
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
				const entries = await Promise.all(
					source
						.filter((item) => item.hasTotp)
						.map(async (item) => {
							try {
								return [totpItemKey(item), await getTotp(item)] as const;
							} catch {
								return undefined;
							}
						}),
				);
				if (
					requestStep !== currentStep() ||
					requestItemsVersion !== itemsVersionRef.current
				) {
					queuedRefreshRef.current = true;
				} else if (mountedRef.current) {
					setCodes(
						Object.fromEntries(
							entries.filter((entry): entry is readonly [string, string] =>
								Boolean(entry),
							),
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
		const interval = setInterval(() => {
			setRemaining(secondsRemaining());
			const nextStep = currentStep();
			if (nextStep !== stepRef.current) {
				stepRef.current = nextStep;
				void refresh();
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [refresh]);

	return { codes, remaining, refreshing, refresh };
}
