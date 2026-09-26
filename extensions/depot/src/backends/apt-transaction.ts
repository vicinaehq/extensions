import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { DepotOperationError } from "../errors.ts";
import {
  ProcessExecutionError,
  runProcess,
  summarizeProcessOutput,
} from "../utils/process.ts";

const APTDCON = "/usr/bin/aptdcon";
const PKEXEC = "/usr/bin/pkexec";
const COMMAND_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };

// Prefer the distro's on-demand transaction broker when available. Its Polkit
// action controls short-lived authorization reuse; direct pkexec remains the
// portable APT fallback and never receives a password from Depot.

export interface AptTransactionOptions {
  aptDaemonArgs?: readonly string[];
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

  if (options.aptDaemonArgs && await isExecutable(APTDCON)) {
    await runAptDaemon(options.aptDaemonArgs, options);
    return;
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

export function aptDaemonPackageArgs(
  action: "install" | "remove" | "upgrade",
  packageIds: readonly string[],
): string[] {
  return [`--${action}`, packageIds.join(" ")];
}

export function parseAptDaemonResult(
  output: string,
): "busy" | "cancelled" | "failed" | undefined {
  const plainOutput = stripAnsi(output);
  if (/100%\s+Cancelled\b/i.test(plainOutput)) return "cancelled";
  if (!/^ERROR:/m.test(plainOutput) && !/100%\s+Failed\b/i.test(plainOutput)) {
    return undefined;
  }
  const packageManagerIsBusy =
    /another package manager|could not get lock|unable to acquire.*lock|lock-frontend|already running/i
      .test(plainOutput);
  return packageManagerIsBusy ? "busy" : "failed";
}

async function runAptDaemon(
  args: readonly string[],
  options: AptTransactionOptions,
): Promise<void> {
  try {
    const result = await runProcess(
      APTDCON,
      ["--hide-terminal", ...args],
      {
        env: COMMAND_ENV,
        input: "\n",
        maxOutputBytes: 2 * 1024 * 1024,
      },
    );
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const plainOutput = stripAnsi(output);
    const outcome = parseAptDaemonResult(output);
    if (outcome === "cancelled") {
      throw new AptTransactionError(
        "cancelled",
        options.cancelledMessage,
        summarizeProcessOutput(plainOutput),
      );
    }
    if (outcome === "busy") {
      throw new AptTransactionError(
        "busy",
        "Another package-management operation is currently running",
        summarizeProcessOutput(plainOutput),
      );
    }
    if (outcome === "failed") {
      throw new AptTransactionError(
        "failed",
        options.failureMessage,
        summarizeProcessOutput(plainOutput),
      );
    }
  } catch (error) {
    throwTransactionError(error, options, "aptdaemon");
  }
}

function throwTransactionError(
  error: unknown,
  options: AptTransactionOptions,
  provider: "aptdaemon" | "direct" | "pkexec",
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
  if (await isExecutable(path)) return;
  throw new AptTransactionError("unavailable", message);
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function stripAnsi(output: string): string {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}
