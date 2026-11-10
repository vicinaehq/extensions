import { useCallback, useEffect, useRef, useState } from "react";
import { formatError } from "./format";
import { query } from "./umbriel";

export interface QueryState<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

export function useUmbrielQuery<T>(command: string): QueryState<T> {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const mounted = useRef(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const result = await query<T>(command);
			if (!mounted.current) return;
			setData(result);
			setError(null);
		} catch (caught) {
			if (!mounted.current) return;
			setData(null);
			setError(formatError(caught));
		} finally {
			if (mounted.current) setLoading(false);
		}
	}, [command]);

	useEffect(() => {
		mounted.current = true;
		refresh();
		return () => {
			mounted.current = false;
		};
	}, [refresh]);

	return { data, loading, error, refresh };
}
