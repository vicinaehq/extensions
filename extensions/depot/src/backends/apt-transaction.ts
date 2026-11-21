import { LINUX_EXECUTABLES } from "../linux.ts";
import {
  C_LOCALE_ENV,
  ProcessExecutionError,
  ProcessOutputTruncatedError,
  requireCompleteOutput,
  requireExecutable,
  runProcess,
  summarizeProcessOutput,
} from "../utils/process.ts";
import {
  AptOperationError,
  NO_AUTHENTICATION_AGENT_MESSAGE,
} from "./apt-errors.ts";
import type { AptDaemonRequest } from "./aptdaemon.ts";
import type { SoftwareOperationOptions } from "../types.ts";

const PKEXEC = LINUX_EXECUTABLES.pkexec;

/** Output bound for every APT plan Depot previews or revalidates. */
export const APT_SIMULATION_OUTPUT_LIMIT = 2 * 1024 * 1024;

export interface AptTransactionOptions {
  aptDaemonRequest?: AptDaemonRequest;
  directExecutable: string;
  directArgs: readonly string[];
  simulationArgs?: readonly string[];
  validateSimulation?: (stdout: string) => void;
  unavailableMessage: string;
  cancelledMessage: string;
  failureMessage: string;
}

/** Simulates exactly the arguments of a real APT run. */
export function aptSimulationArgs(directArgs: readonly string[]): string[] {
  return ["--simulate", ...directArgs];
}

export async function runAptTransaction(
  options: AptTransactionOptions,
  operation: SoftwareOperationOptions = {},
): Promise<void> {
  if (options.aptDaemonRequest) {
    const { runAptDaemonTransaction } = await import("./aptdaemon.ts");
    try {
      await runAptDaemonTransaction(options.aptDaemonRequest, operation);
      return;
    } catch (error) {
      if (!(error instanceof AptOperationError)) throw error;
      if (error.kind !== "unavailable") throw withTransactionMessage(error, options);
    }
  }

  await requireAptExecutable(options.directExecutable, options.unavailableMessage);

  if (options.simulationArgs) {
    operation.onStatus?.({
      message: "Checking transaction safety",
      cancellable: false,
    });
    try {
      const simulation = await runProcess(
        options.directExecutable,
        options.simulationArgs,
        { env: C_LOCALE_ENV, maxOutputBytes: APT_SIMULATION_OUTPUT_LIMIT },
      );
      requireCompleteOutput(options.directExecutable, simulation);
      options.validateSimulation?.(simulation.stdout);
    } catch (error) {
      throwTransactionError(error, options, "direct");
    }
  }

  try {
    await requireExecutable(PKEXEC);
  } catch {
    throw new AptOperationError(
      "unavailable",
      "Polkit authentication is not available",
    );
  }

  operation.onStatus?.({
    message: "APT is working",
    cancellable: false,
  });
  try {
    await runProcess(
      PKEXEC,
      [options.directExecutable, ...options.directArgs],
      {
        captureStdout: false,
        env: C_LOCALE_ENV,
        maxOutputBytes: 1024 * 1024,
      },
    );
  } catch (error) {
    throwTransactionError(error, options, "pkexec");
  }
}

function withTransactionMessage(
  error: AptOperationError,
  options: AptTransactionOptions,
): AptOperationError {
  if (error.kind === "cancelled") {
    return new AptOperationError("cancelled", options.cancelledMessage, error.technicalDetails);
  }
  if (error.kind === "failed") {
    return new AptOperationError(
      "failed",
      options.failureMessage,
      error.technicalDetails ?? error.message,
    );
  }
  return error;
}

function throwTransactionError(
  error: unknown,
  options: AptTransactionOptions,
  provider: "direct" | "pkexec",
): never {
  if (error instanceof ProcessOutputTruncatedError) {
    throw new AptOperationError(
      "unsafe",
      "APT's plan was too large to verify safely",
      error.message,
    );
  }
  if (!(error instanceof ProcessExecutionError)) throw error;

  const output = [error.result.stdout, error.result.stderr]
    .filter(Boolean)
    .join("\n");
  const details = summarizeProcessOutput(output);

  if (provider === "pkexec") {
    const authenticationFailure = classifyPkexecExit(error.result.exitCode, output);
    if (authenticationFailure) {
      throw new AptOperationError(
        authenticationFailure.kind,
        authenticationFailure.kind === "cancelled"
          ? options.cancelledMessage
          : authenticationFailure.message,
        details,
      );
    }
  }
  if (
    /another package manager|could not get lock|unable to acquire.*lock|lock-frontend|already running/i
      .test(output)
  ) {
    throw new AptOperationError(
      "busy",
      "Another package-management operation is currently running",
      details,
    );
  }
  throw new AptOperationError("failed", options.failureMessage, details);
}

/**
 * pkexec(1): exit 126 when the authentication dialog was dismissed, 127 when
 * authorization could not be obtained (denial, error, or no agent). APT
 * itself exits 0 or 100, so these codes come from pkexec.
 */
export function classifyPkexecExit(
  exitCode: number | null,
  output: string,
): AptOperationError | undefined {
  if (exitCode === 126) {
    return new AptOperationError("cancelled", "Authentication was cancelled");
  }
  if (exitCode !== 127) return undefined;
  return new AptOperationError(
    "authentication",
    /no authentication agent/i.test(output)
      ? NO_AUTHENTICATION_AGENT_MESSAGE
      : "Authentication was denied",
  );
}

/** Maps a missing APT tool to the backend's unavailable error. */
export async function requireAptExecutable(
  path: string,
  message: string,
): Promise<void> {
  try {
    await requireExecutable(path);
  } catch (error) {
    throw new AptOperationError("unavailable", message, String(error));
  }
}
