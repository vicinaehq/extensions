/** Format a server timestamp (milliseconds) as a short relative time. */
export function relativeTime(timestamp: number | undefined | null): string | undefined {
  if (timestamp == null) return undefined;
  const diff = Date.now() - timestamp;
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Group timestamps into the buckets the session list shows. */
export function timeBucket(timestamp: number, now: number = Date.now()): "Today" | "Yesterday" | "This Week" | "This Month" | "Older" {
  const startOfDay = (ms: number) => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const today = startOfDay(now);
  if (timestamp >= today) return "Today";
  if (timestamp >= today - 86_400_000) return "Yesterday";
  if (timestamp >= today - 6 * 86_400_000) return "This Week";
  if (timestamp >= today - 29 * 86_400_000) return "This Month";
  return "Older";
}

/** Section order for time bucketed lists. */
export const TIME_BUCKETS = ["Today", "Yesterday", "This Week", "This Month", "Older"] as const;
