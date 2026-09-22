/** Compact token count for badges and metadata: 999, "1.5k", "20k", "1.5M". */
export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 10_000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
