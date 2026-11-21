export class DepotOperationError<Kind extends string> extends Error {
  readonly kind: Kind;
  readonly technicalDetails?: string;

  constructor(
    name: string,
    kind: Kind,
    message: string,
    technicalDetails?: string,
  ) {
    super(message);
    this.name = name;
    this.kind = kind;
    this.technicalDetails = technicalDetails;
  }
}

export function operationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof DepotOperationError ? error.message : fallback;
}

export interface OperationFailure {
  message: string;
  details?: string;
}

export function describeOperationError(
  error: unknown,
  fallback: string,
): OperationFailure {
  const message = operationErrorMessage(error, fallback);
  const rawDetails = error instanceof DepotOperationError
    ? error.technicalDetails
    : error instanceof Error
    ? error.message
    : undefined;
  const details = rawDetails?.trim();

  return details && details !== message ? { message, details } : { message };
}

/**
 * A user cancellation is either a backend error of kind "cancelled" or an
 * aborted signal (`AbortError`) surfacing before a backend could wrap it.
 * Authentication denial is a failure the user should see, not a cancellation.
 */
export function isOperationCancelled(error: unknown): boolean {
  if (error instanceof DepotOperationError) return error.kind === "cancelled";
  return error instanceof Error && error.name === "AbortError";
}
