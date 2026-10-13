import { ClientError } from "@opencode/client";

/**
 * Normalized failures surfaced by the OpenCode service layer.
 * The UI only ever renders these kinds; raw network or API errors never leak through.
 */
export type OpenCodeErrorKind =
  | "unreachable"
  | "auth"
  | "not-found"
  | "busy"
  | "timeout"
  | "rejected"
  | "not-installed";

export class OpenCodeError extends Error {
  readonly kind: OpenCodeErrorKind;
  /** Debug-only context. Never rendered to normal users. */
  readonly detail?: string;

  constructor(kind: OpenCodeErrorKind, message: string, detail?: string) {
    super(message);
    this.name = "OpenCodeError";
    this.kind = kind;
    if (detail) this.detail = detail;
  }
}

export function isOpenCodeError(error: unknown): error is OpenCodeError {
  return error instanceof OpenCodeError;
}

/** The state used when auto-discovery finds no local OpenCode service. */
export function notRunningError(): OpenCodeError {
  return new OpenCodeError("unreachable", "OpenCode is not running.");
}

const NOT_FOUND_PATTERN = /not found/i;
const BUSY_PATTERN = /\bbusy\b/i;

function describeCause(error: unknown, depth = 0): string | undefined {
  if (depth > 4 || !error || typeof error !== "object") return undefined;
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return [cause.message, describeCause(cause.cause, depth + 1)].filter(Boolean).join(": ");
  }
  return undefined;
}

/** Classify a raw message into the error kinds the UI understands. */
function fromMessage(message: string, httpStatus?: number): OpenCodeError {
  if (httpStatus === 401 || httpStatus === 403 || /unauthorized/i.test(message)) {
    return new OpenCodeError("auth", "Authentication failed.", message);
  }
  if (NOT_FOUND_PATTERN.test(message)) {
    return new OpenCodeError("not-found", "Session no longer exists.", message);
  }
  if (BUSY_PATTERN.test(message)) {
    return new OpenCodeError("busy", "OpenCode is already working on this session.", message);
  }
  return new OpenCodeError("rejected", "OpenCode rejected the request.", message);
}

/**
 * Normalize any thrown error into an {@link OpenCodeError}.
 * `httpStatus` comes from the adapter's fetch wrapper when the response status was observed.
 */
export function mapOpenCodeError(error: unknown, httpStatus?: number): OpenCodeError {
  if (error instanceof OpenCodeError) return error;

  if (error instanceof ClientError) {
    if (error.reason === "Transport") {
      const detail = describeCause(error);
      return new OpenCodeError("unreachable", "OpenCode server is unreachable.", detail);
    }
    return fromMessage(error.message, httpStatus);
  }

  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return new OpenCodeError("timeout", "Request timed out.");
    }
    return fromMessage(error.message, httpStatus);
  }

  // The promise client surfaces typed API errors (e.g. SessionNotFoundError)
  // as plain objects carrying the API message, not as Error instances.
  if (typeof error === "object") {
    const rawMessage = (error as { message?: unknown }).message;
    if (typeof rawMessage === "string" && rawMessage) {
      return fromMessage(rawMessage, httpStatus);
    }
    return new OpenCodeError("rejected", "OpenCode rejected the request.", JSON.stringify(error));
  }

  return new OpenCodeError("rejected", "OpenCode rejected the request.");
}

/** Short, user-actionable hint shown under the error title. */
export function errorHint(error: OpenCodeError): string {
  switch (error.kind) {
    case "unreachable":
      return "Start OpenCode and try again.";
    case "auth":
      return "Check the Server URL, username, and password in the extension settings.";
    case "not-found":
      return "It no longer exists on the OpenCode server.";
    case "busy":
      return "OpenCode is already working on this session. Try again in a moment.";
    case "timeout":
      return "OpenCode took too long to respond. Try again.";
    case "rejected":
      return "OpenCode could not process this request.";
    case "not-installed":
      return "OpenCode must be installed separately. Get the V2 CLI from https://opencode.ai/v2.";
  }
}
