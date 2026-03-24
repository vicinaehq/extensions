import { PactlVolumeChannel } from "../pactl";

export function percentFromVolume(
  volume?: Record<string, PactlVolumeChannel>,
): number | undefined {
  if (!volume) return undefined;
  const percents = Object.values(volume)
    .map((ch) => {
      const m = ch.value_percent.match(/(\d+)%/);
      return m ? Number(m[1]) : undefined;
    })
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!percents.length) return undefined;
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
}
