import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { DepotOperationError } from "../errors.ts";
import {
  ProcessExecutionError,
  runProcess,
  summarizeProcessOutput,
} from "../utils/process.ts";
import type {
  AptDaemonError,
  AptDaemonRequest,
} from "./aptdaemon.ts";

const PKEXEC = "/usr/bin/pkexec";
const COMMAND_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };

export interface AptTransactionOptions {
  aptDaemonRequest?: AptDaemonRequest;
  directExecutable: string;
  directArgs: readonly string[];
  simulationArgs?: readonly string[];
  unavailableMessage: string;
  cancelledMessage: string;
  failureMessage: string;
}

type AptTransactionErrorKind =
  | "unavailable"
  | "cancelled"
  | "authentication"
  | "busy"
  | "failed";

export class AptTransactionError
  extends DepotOperationError<AptTransactionErrorKind> {
  constructor(
    kind: AptTransactionErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super("AptTransactionError", kind, message, technicalDetails);
  }
}

export async function runAptTransaction(
  options: AptTransactionOptions,
): Promise<void> {
  if (options.simulationArgs) {
    await requireExecutable(options.directExecutable, options.unavailableMessage);
    try {
      await runProcess(options.directExecutable, options.simulationArgs, {
        env: COMMAND_ENV,
        maxOutputBytes: 1024 * 1024,
      });
    } catch (error) {
      throwTransactionError(error, options, "direct");
    }
  }

  if (options.aptDaemonRequest) {
    const aptdaemon = await import("./aptdaemon.ts");
    try {
      await aptdaemon.runAptDaemonTransaction(options.aptDaemonRequest);
      return;
    } catch (error) {
      if (!(error instanceof aptdaemon.AptDaemonError)) throw error;
      if (error.kind !== "unavailable") throwAptDaemonError(error, options);
    }
  }

  await requireExecutable(options.directExecutable, options.unavailableMessage);
  await requireExecutable(PKEXEC, "Polkit authentication is not available");

  try {
    await runProcess(
      PKEXEC,
      [options.directExecutable, ...options.directArgs],
      {
        captureStdout: false,
        env: COMMAND_ENV,
        maxOutputBytes: 1024 * 1024,
      },
    );
  } catch (error) {
    throwTransactionError(error, options, "pkexec");
  }
}

function throwAptDaemonError(
  error: AptDaemonError,
  options: AptTransactionOptions,
): never {
  const message = error.kind === "cancelled"
    ? options.cancelledMessage
    : error.kind === "authentication"
    ? "Authentication was cancelled or denied"
    : error.kind === "busy"
    ? "Another package-management operation is currently running"
    : options.failureMessage;
  throw new AptTransactionError(error.kind, message, error.technicalDetails);
}

function throwTransactionError(
  error: unknown,
  options: AptTransactionOptions,
  provider: "direct" | "pkexec",
): never {
  if (!(error instanceof ProcessExecutionError)) throw error;

  const output = [error.result.stdout, error.result.stderr]
    .filter(Boolean)
    .join("\n");
  const details = summarizeProcessOutput(output);

  if (provider === "pkexec" && error.result.exitCode === 126) {
    throw new AptTransactionError("cancelled", options.cancelledMessage, details);
  }
  if (
    (provider === "pkexec" && error.result.exitCode === 127) ||
    /not allowed|not authori[sz]ed|authentication.*(?:cancel|deni)|policykit.*(?:cancel|deni)/i
      .test(output)
  ) {
    throw new AptTransactionError(
      "authentication",
      "Authentication was cancelled or denied",
      details,
    );
  }
  if (
    /another package manager|could not get lock|unable to acquire.*lock|lock-frontend|already running/i
      .test(output)
  ) {
    throw new AptTransactionError(
      "busy",
      "Another package-management operation is currently running",
      details,
    );
  }
  throw new AptTransactionError("failed", options.failureMessage, details);
}

async function requireExecutable(path: string, message: string): Promise<void> {
  try {
    await access(path, constants.X_OK);
  } catch {
    throw new AptTransactionError("unavailable", message);
  }
}
