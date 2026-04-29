export function secondsRemaining(nowMs: number, periodSeconds: number): number {
  const periodMs = periodSeconds * 1000;
  const elapsed = nowMs % periodMs;
  const remainingMs = periodMs - elapsed;
  return Math.ceil(remainingMs / 1000);
}
