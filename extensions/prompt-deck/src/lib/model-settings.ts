import { formatProvider, getProvider } from "./providers";
import { trimText } from "./string";
import type { ProviderType } from "./types";

/**
 * The optional model tuning knobs — temperature, reasoning level and max output
 * tokens — each exposed three ways:
 *
 * - `parseOptional*` throws on bad input, for form validation where the user can fix it
 * - `resolve*` ignores bad input, for run time where a stored value may predate a
 *   provider switch and should not strand the prompt
 * - `format*Hint` supplies the form's info text
 */

/* -------------------------------------------------------------- temperature */

export function parseOptionalTemperature(value: unknown, provider: ProviderType, label = "Temperature"): number | undefined {
  if (isBlank(value)) {
    return undefined;
  }

  const parsed = toNumber(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }

  const range = getProvider(provider).temperature;
  if (parsed < range.min || parsed > range.max) {
    throw new Error(`${label} must be between ${range.min} and ${range.max} for ${formatProvider(provider)}.`);
  }

  return parsed;
}

export function resolveTemperature(value: unknown, provider: ProviderType): number | undefined {
  if (isBlank(value)) {
    return undefined;
  }

  const parsed = toNumber(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  const range = getProvider(provider).temperature;
  return parsed >= range.min && parsed <= range.max ? parsed : undefined;
}

export function formatTemperatureHint(provider: ProviderType): string {
  const range = getProvider(provider).temperature;
  return `Blank uses the provider/model default, usually 1.0. ${formatProvider(provider)} supports ${range.min}-${range.max}.`;
}

/* ---------------------------------------------------------- reasoning level */

/**
 * Reasoning levels are passed to the provider verbatim rather than checked
 * against a list: providers add levels over time, and an OpenAI-compatible
 * endpoint may accept values OpenAI itself does not. An unusable value surfaces
 * as a provider error, which is more useful than being silently dropped.
 *
 * "unset" is still honoured as meaning no level: it was the sentinel the old
 * dropdown stored, so prompts created before this became a free text field
 * carry it.
 */
export function resolveReasoningLevel(value: unknown): string | undefined {
  const level = trimText(value);
  return !level || level === "unset" ? undefined : level;
}

export function formatReasoningHint(provider: ProviderType): string {
  const levels = getProvider(provider).suggestedReasoningLevels.join(", ");
  return `Blank uses the provider/model default. ${formatProvider(provider)} accepts ${levels}; other values are passed through as-is.`;
}

/* -------------------------------------------------------- max output tokens */

export function parseOptionalMaxOutputTokens(value: unknown, label = "Max output tokens"): number | undefined {
  if (isBlank(value)) {
    return undefined;
  }

  const parsed = toNumber(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive whole number.`);
  }

  return parsed;
}

export function resolveMaxOutputTokens(value: unknown): number | undefined {
  const parsed = toNumber(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

/* --------------------------------------------------------------- internals */

/** Treats null, undefined and whitespace-only strings as "not set". */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !trimText(value));
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(trimText(value));
}
