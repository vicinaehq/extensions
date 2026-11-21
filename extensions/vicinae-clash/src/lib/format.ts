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
  if (!(error instanceof Error)) return String(error);

  const messages: string[] = [];
  const seen = new Set<Error>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    // Node's AggregateError can have an empty message but still expose a network error code.
    const code = "code" in current && typeof current.code === "string" ? current.code : "";
    const message = current.message || code;
    if (message && !messages.includes(message)) messages.push(message);
    current = current.cause;
  }

  if (current != null && !(current instanceof Error)) messages.push(String(current));
  return messages.join(": ");
}
