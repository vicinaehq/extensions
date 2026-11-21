import { DepotOperationError } from "../errors.ts";

export type AptErrorKind =
  | "unavailable"
  | "not-found"
  | "cancelled"
  | "authentication"
  | "busy"
  | "unsafe"
  | "failed";

/** The single error type raised by the APT backend, transactions, and aptdaemon. */
export class AptOperationError extends DepotOperationError<AptErrorKind> {
  constructor(
    kind: AptErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super("AptOperationError", kind, message, technicalDetails);
  }
}

export const NO_AUTHENTICATION_AGENT_MESSAGE =
  "No Polkit authentication agent is running. Start one (for example polkit-gnome) and try again.";
