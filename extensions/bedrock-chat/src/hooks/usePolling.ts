import { useEffect, useState } from "react";

/**
 * Triggers a re-render at a fixed interval.
 * Useful for reading from a shared ref in a pushed detail view
 * that needs to pick up streaming updates from a parent component.
 */
export function usePolling(intervalMs = 50): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);
}
