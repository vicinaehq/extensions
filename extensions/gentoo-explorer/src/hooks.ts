import { useEffect, useRef, useState } from "react";

export const useApi = <T>(
	fn: (signal: AbortSignal) => Promise<T>,
	deps: unknown[],
	enabled = true,
) => {
	const [data, setData] = useState<T | null>(null);
	const [isLoading, setIsLoading] = useState(enabled);
	const [error, setError] = useState<Error | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		abortRef.current?.abort();
		setError(null);

		if (!enabled) {
			setIsLoading(false);
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		fn(controller.signal)
			.then(setData)
			.catch((err) => {
				if (controller.signal.aborted) return;
				setError(err instanceof Error ? err : new Error(String(err)));
				setData(null);
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					setIsLoading(false);
				}
			});

		return () => controller.abort();
	}, [enabled, ...deps]);

	return { data, isLoading, error };
};
