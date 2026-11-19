import type { OperationFailure } from "../errors.ts";

/** One readable line per failed source: its message and last diagnostic. */
export function sourceWarning(
  label: string,
  failure: OperationFailure,
): string {
  const detail = failure.details
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  return detail
    ? `${label}: ${failure.message} · ${detail}`
    : `${label}: ${failure.message}`;
}

export function updateSourceErrors(
  aptError?: OperationFailure,
  flatpakError?: OperationFailure,
): string[] {
  return [
    aptError ? sourceWarning("APT", aptError) : undefined,
    flatpakError ? sourceWarning("Flatpak", flatpakError) : undefined,
  ].filter((message): message is string => Boolean(message));
}
