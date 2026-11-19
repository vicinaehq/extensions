import { readFile } from "node:fs/promises";
import {
  ConnectionClosedError,
  DBusError,
  type DBusInterface,
  type DBusPromise,
  type MessageBus,
  systemBus,
  variantValue,
} from "dbus-native";
import { LINUX_EXECUTABLES } from "../linux.ts";
import type { SoftwareOperationOptions, SoftwareOperationStatus } from "../types.ts";
import {
  C_LOCALE_ENV,
  ProcessExecutionError,
  requireExecutable,
  runProcess,
} from "../utils/process.ts";
import {
  type AptErrorKind,
  AptOperationError,
  NO_AUTHENTICATION_AGENT_MESSAGE,
} from "./apt-errors.ts";

const SERVICE = "org.debian.apt";
const DAEMON_PATH = "/org/debian/apt";
const DAEMON_INTERFACE = "org.debian.apt";
const TRANSACTION_INTERFACE = "org.debian.apt.transaction";
const UPDATE_CACHE_ACTION = "org.debian.apt.update-cache";
const BUSY_MESSAGE = "Another package-management operation is currently running";

export type AptDaemonRequest = { kind: "refresh-cache" };

interface AptDaemonInterface extends DBusInterface {
  UpdateCache(): DBusPromise<string>;
}

interface AptDaemonTransactionInterface extends DBusInterface {
  Run(): DBusPromise<void>;
  Cancel(): DBusPromise<void>;
}

interface AptDaemonErrorDetails {
  code?: string;
  message?: string;
}

let bus: MessageBus | undefined;
let daemonPromise: Promise<AptDaemonInterface> | undefined;

export async function runAptDaemonTransaction(
  request: AptDaemonRequest,
  options: SoftwareOperationOptions = {},
): Promise<void> {
  try {
    if (options.signal?.aborted) {
      throw new AptOperationError("cancelled", "Transaction was cancelled");
    }
    const activeBus = getBus();
    const daemon = await getDaemon(activeBus);
    const transactionPath = await createTransaction(daemon, request);
    const transaction = await activeBus.getInterface<AptDaemonTransactionInterface>(
      SERVICE,
      transactionPath,
      TRANSACTION_INTERFACE,
    );
    await runTransaction(activeBus, transaction, request, options);
  } catch (error) {
    if (error instanceof AptOperationError) throw error;
    const classified = classifyAptDaemonDbusError(error);
    if (classified.kind === "unavailable" || error instanceof ConnectionClosedError) {
      resetConnection();
    }
    throw classified;
  }
}

export function describeAptDaemonStatus(status: string): string {
  switch (status) {
    case "status-setting-up":
      return "Preparing transaction";
    case "status-query":
      return "Checking package state";
    case "status-authenticating":
      return "Waiting for authentication";
    case "status-waiting":
      return "Waiting for APT";
    case "status-waiting-lock":
      return "Waiting for the package-manager lock";
    case "status-loading-cache":
      return "Loading package metadata";
    case "status-resolving-dep":
      return "Resolving dependencies";
    case "status-downloading":
      return "Downloading packages";
    case "status-downloading-repo":
      return "Downloading package metadata";
    case "status-committing":
      return "Applying package changes";
    case "status-cleaning-up":
      return "Cleaning up";
    case "status-cancelling":
      return "Cancelling transaction";
    case "status-finished":
      return "Finishing";
    case "status-waiting-medium":
      return "Waiting for installation media";
    case "status-waiting-config-file-prompt":
      return "Waiting for a configuration choice";
    default:
      return "APT is working";
  }
}

/**
 * Classifies a finished transaction from its ExitState and Error property
 * (code, details) as set by aptdaemon 2.0.2 (aptdaemon/enums.py). A Polkit
 * dialog dismissed during aptdaemon's own check is indistinguishable from a
 * denial (both are error-not-authorized); Depot's pkcheck pre-authorization
 * reports dismissal as a cancellation before that point.
 */
export function classifyAptDaemonOutcome(
  exitState: string,
  error: AptDaemonErrorDetails = {},
): AptErrorKind | undefined {
  if (exitState === "exit-success") return undefined;
  if (exitState === "exit-cancelled") return "cancelled";
  switch (error.code) {
    case "error-not-authorized":
    case "error-auth-failed":
      return "authentication";
    case "error-no-lock":
      return "busy";
    default:
      return "failed";
  }
}

function outcomeMessage(
  kind: AptErrorKind,
  exitState: string,
  details: AptDaemonErrorDetails,
): string {
  switch (kind) {
    case "authentication":
      return "Authentication was denied";
    case "busy":
      return BUSY_MESSAGE;
    case "cancelled":
      return "Transaction was cancelled";
    default:
      return details.message ?? `aptdaemon finished with ${exitState}`;
  }
}

function getBus(): MessageBus {
  if (bus) return bus;

  const created = systemBus();
  bus = created;
  const stream = created.connection.stream as typeof created.connection.stream & {
    unref?: () => void;
  };
  stream.unref?.();
  const forget = () => {
    if (bus === created) resetConnection();
  };
  created.connection.on("error", (error) => {
    console.debug("aptdaemon D-Bus connection failed", error);
    forget();
  });
  created.connection.on("end", forget);
  created.connection.on("close", forget);
  created.connection.on("handlerError", (error) => {
    console.debug("aptdaemon D-Bus signal handler failed", error);
  });
  return created;
}

function resetConnection(): void {
  bus = undefined;
  daemonPromise = undefined;
}

function getDaemon(activeBus: MessageBus): Promise<AptDaemonInterface> {
  if (daemonPromise) return daemonPromise;
  const pending = Promise.resolve(
    activeBus.getInterface<AptDaemonInterface>(
      SERVICE,
      DAEMON_PATH,
      DAEMON_INTERFACE,
    ),
  );
  daemonPromise = pending;
  // Never cache a failed lookup: aptdaemon is activated on demand.
  pending.catch(() => {
    if (daemonPromise === pending) daemonPromise = undefined;
  });
  return pending;
}

/**
 * Calls onLost when aptdaemon leaves the bus or the connection closes, so a
 * transaction never waits for a Finished signal that cannot arrive.
 */
async function watchDaemonLoss(
  activeBus: MessageBus,
  onLost: () => void,
): Promise<() => Promise<void>> {
  const onOwnerChanged = (name: unknown, _oldOwner: unknown, newOwner: unknown) => {
    if (name === SERVICE && !newOwner) onLost();
  };
  activeBus.connection.on("end", onLost);
  activeBus.connection.on("close", onLost);

  let busDaemon: DBusInterface | undefined;
  try {
    busDaemon = await activeBus.getInterface(
      "org.freedesktop.DBus",
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus",
    );
    await busDaemon.$subscribe("NameOwnerChanged", onOwnerChanged);
  } catch (error) {
    console.debug("aptdaemon ownership could not be watched", error);
    busDaemon = undefined;
  }

  return async () => {
    activeBus.connection.removeListener("end", onLost);
    activeBus.connection.removeListener("close", onLost);
    await busDaemon?.$unsubscribe("NameOwnerChanged", onOwnerChanged)
      .catch(() => undefined);
  };
}

async function createTransaction(
  daemon: AptDaemonInterface,
  request: AptDaemonRequest,
): Promise<string> {
  switch (request.kind) {
    case "refresh-cache":
      return await daemon.UpdateCache();
  }
}

async function runTransaction(
  activeBus: MessageBus,
  transaction: AptDaemonTransactionInterface,
  request: AptDaemonRequest,
  options: SoftwareOperationOptions,
): Promise<void> {
  let resolveFinished: (exitState: string) => void = () => undefined;
  let rejectFinished: (error: Error) => void = () => undefined;
  const finished = new Promise<string>((resolve, reject) => {
    resolveFinished = resolve;
    rejectFinished = reject;
  });
  // Loss can be reported before Run(); the rejection is consumed below.
  finished.catch(() => undefined);
  const onFinished = (exitState: string) => resolveFinished(exitState);
  const onDaemonLost = () => {
    resetConnection();
    rejectFinished(new AptOperationError(
      "failed",
      "aptdaemon stopped before the transaction finished",
    ));
  };
  let status = "status-setting-up";
  let cancellable = false;
  let cancellationRequested = false;

  const reportStatus = () => {
    const update: SoftwareOperationStatus = {
      message: describeAptDaemonStatus(status),
      cancellable,
    };
    try {
      options.onStatus?.(update);
    } catch (error) {
      console.debug("APT status callback failed", error);
    }
  };

  const requestCancellation = () => {
    cancellationRequested = true;
    if (!cancellable) return;
    cancellable = false;
    reportStatus();
    void transaction.Cancel().catch((error: unknown) => {
      console.debug("APT transaction could not be cancelled", error);
    });
  };

  const onPropertyChanged = (propertyName: string, encodedValue: unknown) => {
    const value = variantValue(encodedValue);
    if (propertyName === "Status" && typeof value === "string") {
      status = value;
    } else if (propertyName === "Cancellable" && typeof value === "boolean") {
      cancellable = value;
      if (cancellationRequested && cancellable) requestCancellation();
    } else {
      return;
    }
    reportStatus();
  };

  let subscribedToProperties = false;
  let stopWatchingDaemon: (() => Promise<void>) | undefined;
  await transaction.$subscribe("Finished", onFinished);
  try {
    stopWatchingDaemon = await watchDaemonLoss(activeBus, onDaemonLost);
    await transaction.$subscribe("PropertyChanged", onPropertyChanged);
    subscribedToProperties = true;
    options.signal?.addEventListener("abort", requestCancellation, { once: true });

    const initialProperties = await transaction.$readAllProps();
    if (typeof initialProperties.Status === "string") {
      status = initialProperties.Status;
    }
    cancellable = initialProperties.Cancellable === true;
    reportStatus();
    if (options.signal?.aborted) requestCancellation();

    await preauthorize(request, options.signal ?? new AbortController().signal);

    if (cancellationRequested) {
      // Never start a transaction the user already asked to cancel.
      void transaction.Cancel().catch(() => undefined);
      throw new AptOperationError("cancelled", "Transaction was cancelled");
    }
    await transaction.Run();
    const exitState = await finished;
    const properties = await transaction.$readAllProps();
    const details = parseErrorDetails(properties.Error);
    const outcome = classifyAptDaemonOutcome(exitState, details);
    if (outcome) {
      throw new AptOperationError(
        outcome,
        outcomeMessage(outcome, exitState, details),
        formatDetails(details),
      );
    }
  } catch (error) {
    if (error instanceof AptOperationError) throw error;
    throw classifyAptDaemonDbusError(error);
  } finally {
    options.signal?.removeEventListener("abort", requestCancellation);
    await stopWatchingDaemon?.();
    await transaction.$unsubscribe("Finished", onFinished).catch(() => undefined);
    if (subscribedToProperties) {
      await transaction.$unsubscribe("PropertyChanged", onPropertyChanged).catch(() => undefined);
    }
  }
}

async function preauthorize(
  request: AptDaemonRequest,
  signal: AbortSignal,
): Promise<void> {
  const action = preauthorizationAction(request);
  if (!action) return;

  let subject: string | undefined;
  try {
    await requireExecutable(LINUX_EXECUTABLES.pkcheck);
    const startTime = parseProcStartTime(
      await readFile("/proc/self/stat", "utf8"),
    );
    const uid = process.getuid?.();
    if (startTime && uid !== undefined) {
      subject = `${process.pid},${startTime},${uid}`;
    }
  } catch {
    return;
  }
  if (!subject) return;

  try {
    await runProcess(
      LINUX_EXECUTABLES.pkcheck,
      [
        "--action-id",
        action,
        "--process",
        subject,
        "--allow-user-interaction",
      ],
      {
        signal,
        captureStdout: false,
        env: C_LOCALE_ENV,
        maxOutputBytes: 64 * 1024,
      },
    );
  } catch (error) {
    const outcome = classifyPkcheckExit(
      error instanceof ProcessExecutionError ? error.result.exitCode : null,
    );
    if (outcome) throw outcome;
    if (signal.aborted) {
      throw new AptOperationError("cancelled", "Transaction was cancelled");
    }
    // Let aptdaemon perform its normal authorization check when pkcheck
    // itself fails for another reason.
  }
}

/**
 * pkcheck(1) exit statuses: 1 not authorized, 2 no authentication agent could
 * be used, 3 the authentication dialog was dismissed.
 */
export function classifyPkcheckExit(
  exitCode: number | null,
): AptOperationError | undefined {
  switch (exitCode) {
    case 1:
      return new AptOperationError("authentication", "Authentication was denied");
    case 2:
      return new AptOperationError("authentication", NO_AUTHENTICATION_AGENT_MESSAGE);
    case 3:
      return new AptOperationError("cancelled", "Authentication was cancelled");
    default:
      return undefined;
  }
}

/**
 * The Polkit action aptdaemon 2.0.2 checks in Transaction._check_auth().
 * Installing from the high-trust whitelist uses a different action, but
 * Depot never sets that whitelist. Cache refresh is allowed without a prompt
 * for active sessions on Ubuntu; checking it still classifies a dismissed
 * prompt in other sessions as a cancellation.
 */
export function preauthorizationAction(
  request: AptDaemonRequest,
): string | undefined {
  switch (request.kind) {
    case "refresh-cache":
      return UPDATE_CACHE_ACTION;
  }
}

export function parseProcStartTime(stat: string): string | undefined {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 0) return undefined;
  const fields = stat.slice(commandEnd + 1).trim().split(/\s+/);
  const startTime = fields[19];
  return startTime && /^\d+$/.test(startTime) ? startTime : undefined;
}

function parseErrorDetails(value: unknown): AptDaemonErrorDetails {
  if (!Array.isArray(value)) return {};
  const [code, message] = value;
  return {
    code: typeof code === "string" && code ? code : undefined,
    message: typeof message === "string" && message ? message : undefined,
  };
}

function formatDetails(details: AptDaemonErrorDetails): string | undefined {
  return [details.code, details.message].filter(Boolean).join(": ") || undefined;
}

/**
 * Maps a failed D-Bus call using the error names aptdaemon 2.0.2 raises
 * (aptdaemon/errors.py) and the bus's own errors when it is not running.
 */
export function classifyAptDaemonDbusError(error: unknown): AptOperationError {
  const details = error instanceof Error ? error.message : String(error);
  const dbusName = error instanceof DBusError ? error.dbusName ?? "" : "";

  switch (dbusName) {
    case "org.freedesktop.DBus.Error.ServiceUnknown":
    case "org.freedesktop.DBus.Error.NameHasNoOwner":
    case "org.freedesktop.DBus.Error.NoServer":
    case "org.freedesktop.DBus.Error.Spawn.ServiceNotFound":
      return new AptOperationError("unavailable", "aptdaemon is unavailable", details);
    case "org.debian.apt.TransactionCancelled":
      return new AptOperationError("cancelled", "Transaction was cancelled", details);
    case "org.freedesktop.PolicyKit.Error.NotAuthorized":
    case "org.freedesktop.PolicyKit.Error.Failed":
      return new AptOperationError(
        "authentication",
        "Authentication was denied",
        details,
      );
    case "org.debian.apt.TransactionFailed":
      // TransactionFailed messages are "<error code>: <details>".
      if (details.startsWith("error-no-lock")) {
        return new AptOperationError("busy", BUSY_MESSAGE, details);
      }
      break;
  }
  if (!dbusName && /ECONNREFUSED|ENOENT/.test(details)) {
    return new AptOperationError("unavailable", "aptdaemon is unavailable", details);
  }
  return new AptOperationError("failed", "aptdaemon transaction failed", details);
}
