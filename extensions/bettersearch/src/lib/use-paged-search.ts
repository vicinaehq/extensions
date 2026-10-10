import { useCallback, useEffect, useRef, useState } from "react";

const SCANNING_RETRY_MS = 400;

type Page<T, C> = { items: T[]; next: C | null; scanning: boolean };

/**
 * Runs `fetchPage` whenever `key` changes, drops stale responses, re-runs
 * while the index is still scanning, and exposes `loadMore` for pagination.
 */
export function usePagedSearch<T, C>(
	key: string,
	fetchPage: (cursor: C | null) => Promise<Page<T, C>>,
) {
	const [items, setItems] = useState<T[]>([]);
	const [next, setNext] = useState<C | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const generation = useRef(0);
	const fetchRef = useRef(fetchPage);
	fetchRef.current = fetchPage;

	useEffect(() => {
		const current = ++generation.current;
		let timer: NodeJS.Timeout | undefined;

		const run = async () => {
			setIsLoading(true);
			try {
				const page = await fetchRef.current(null);
				if (current !== generation.current) return;
				setItems(page.items);
				setNext(page.next);
				setError(null);
				if (page.scanning) {
					timer = setTimeout(run, SCANNING_RETRY_MS);
					return;
				}
			} catch (e) {
				if (current !== generation.current) return;
				setItems([]);
				setNext(null);
				setError(e instanceof Error ? e.message : String(e));
			}
			setIsLoading(false);
		};

		run();
		return () => clearTimeout(timer);
	}, [key]);

	const loadMore = useCallback(async () => {
		if (next === null) return;
		const current = generation.current;
		setIsLoading(true);
		try {
			const page = await fetchRef.current(next);
			if (current !== generation.current) return;
			setItems((prev) => [...prev, ...page.items]);
			setNext(page.next);
		} catch (e) {
			if (current === generation.current)
				setError(e instanceof Error ? e.message : String(e));
		} finally {
			if (current === generation.current) setIsLoading(false);
		}
	}, [next]);

	return { items, isLoading, error, hasMore: next !== null, loadMore };
}
