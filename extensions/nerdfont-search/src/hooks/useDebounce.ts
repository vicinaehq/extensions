import { useEffect, useRef, useState } from "react";

export function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const lastExecutionRef = useRef<number>(0);

	useEffect(() => {
		const now = Date.now();
		const timeSinceLastExecution = now - lastExecutionRef.current;

		// Leading: Execute immediately if enough time has passed since last execution
		if (timeSinceLastExecution >= delay) {
			setDebouncedValue(value);
			lastExecutionRef.current = now;
			return;
		}

		// Otherwise, debounce (trailing)
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}

		timerRef.current = setTimeout(() => {
			setDebouncedValue(value);
			lastExecutionRef.current = Date.now();
		}, delay);

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [value, delay]);

	return debouncedValue;
}
