import { DepotOperationError } from "../errors.ts";
import type { FlatpakScope } from "../types.ts";
import {
  ProcessExecutionError,
  isProcessAborted,
  summarizeProcessOutput,
} from "../utils/process.ts";
import { isValidFlatpakAppId } from "./flatpak-parsing.ts";

export const ALL_SCOPES: readonly FlatpakScope[] = ["user", "system"];

export type FlatpakErrorKind =
  | "unavailable"
  | "not-found"
  | "cancelled"
  | "authentication"
  | "network"
  | "failed";

export class FlatpakOperationError extends DepotOperationError<FlatpakErrorKind> {
  constructor(
    kind: FlatpakErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super("FlatpakOperationError", kind, message, technicalDetails);
  }
}

/** Maps a failed Flatpak command to a user-facing error kind. */
export function classifyFlatpakFailure(error: unknown, fallback: string): Error {
  if (error instanceof FlatpakOperationError || isProcessAborted(error)) {
    return error as Error;
  }
  if (!(error instanceof ProcessExecutionError)) {
    return new FlatpakOperationError(
      "failed",
      fallback,
      error instanceof Error ? error.message : String(error),
    );
  }

  const details = summarizeProcessOutput(error.result.stderr);
  const text = details ?? "";
  if (/cancel(?:led|ed)/i.test(text)) {
    return new FlatpakOperationError("cancelled", "Flatpak operation was cancelled", details);
  }
  if (/not authorized|not allowed|permission denied|authentication.*deni/i.test(text)) {
    return new FlatpakOperationError("authentication", "Authentication was denied", details);
  }
  if (/network|resolve|connection|download/i.test(text)) {
    return new FlatpakOperationError(
      "network",
      "Network unavailable or Flatpak download failed",
      details,
    );
  }
  return new FlatpakOperationError("failed", fallback, details);
}

export function assertAppId(id: string): void {
  if (!isValidFlatpakAppId(id)) {
    throw new FlatpakOperationError("not-found", "Invalid Flatpak application ID");
  }
}

export function scopeFlag(scope: FlatpakScope): "--user" | "--system" {
  return scope === "user" ? "--user" : "--system";
}
