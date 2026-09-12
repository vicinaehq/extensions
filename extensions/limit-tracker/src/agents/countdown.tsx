import { useEffect, useState } from "react";
import { List } from "@vicinae/api";

import { formatCountdown } from "./detail-format.ts";

export { formatCountdown };

/**
 * Live countdown state: mirrors the given snapshot seconds and ticks down
 * once per second until it reaches 0. Used by LiveResetLabel and by the
 * compact limit rows in limits.tsx.
 */
export function useResetCountdown(seconds: number | null | undefined): number | null {
  const [remaining, setRemaining] = useState<number | null>(seconds ?? null);

  useEffect(() => {
    setRemaining(seconds ?? null);
  }, [seconds]);

  useEffect(() => {
    if (remaining === null || remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  return remaining;
}

/**
 * Live "Resets In" label that ticks every second but only displays
 * days/hours/minutes. `seconds` is the snapshot remaining at first render;
 * the component keeps its own decreasing clock so the label updates live
 * without refetching.
 */
export function LiveResetLabel({ seconds, title = "Resets In" }: { seconds: number | null | undefined; title?: string }) {
  const remaining = useResetCountdown(seconds);
  return <List.Item.Detail.Metadata.Label title={title} text={remaining === null ? "—" : formatCountdown(remaining)} />;
}
