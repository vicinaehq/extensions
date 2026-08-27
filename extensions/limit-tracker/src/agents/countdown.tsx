import { useEffect, useState } from "react";
import { List } from "@vicinae/api";

/**
 * Formats a remaining-second count as days/hours/minutes only (no seconds),
 * matching the Raycast "Resets In: 6d 18h" style.
 */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "now";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return minutes > 0 ? `${days}d ${hours}h ${minutes}m` : `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Live "Resets In" label that ticks every second but only displays
 * days/hours/minutes. `seconds` is the snapshot remaining at first render;
 * the component keeps its own decreasing clock so the label updates live
 * without refetching.
 */
export function LiveResetLabel({ seconds, title = "Resets In" }: { seconds: number | null | undefined; title?: string }) {
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

  return <List.Item.Detail.Metadata.Label title={title} text={remaining === null ? "—" : formatCountdown(remaining)} />;
}
