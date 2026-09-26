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

export function isOperationCancelled(error: unknown): boolean {
  return error instanceof DepotOperationError &&
    error.kind === "cancelled";
}
