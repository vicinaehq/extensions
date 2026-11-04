const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function prettyBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1000)), UNITS.length - 1);
  const amount = value / 1000 ** exponent;
  return `${amount >= 100 || exponent === 0 ? Math.round(amount) : Number(amount.toFixed(1))} ${UNITS[exponent]}`;
}

export function formatTime(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function titleCase(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
