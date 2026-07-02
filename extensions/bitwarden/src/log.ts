import { redactSensitive } from './redact';

export function logError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  const raw = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const message = redactSensitive(raw);
  const ctx = extra ? ' ' + JSON.stringify(extra) : '';
  console.error(`[bitwarden:${scope}] ${message}${ctx}`);
}
