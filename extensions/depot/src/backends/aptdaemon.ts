import { readFile } from "node:fs/promises";
import {
  DBusError,
  type DBusInterface,
  type DBusPromise,
  type MessageBus,
  systemBus,
  variantValue,
} from "dbus-native";
import { LINUX_EXECUTABLES } from "../linux.ts";
import type {
  SoftwareOperationOptions,
  SoftwareOperationStatus,
} from "../types.ts";
import {
  C_LOCALE_ENV,
  ProcessExecutionError,
  requireExecutable,
  runProcess,
} from "../utils/process.ts";

const SERVICE = "org.debian.apt";
const DAEMON_PATH = "/org/debian/apt";
const DAEMON_INTERFACE = "org.debian.apt";
const TRANSACTION_INTERFACE = "org.debian.apt.transaction";
const INSTALL_REMOVE_ACTION = "org.debian.apt.install-or-remove-packages";
const UPGRADE_ACTION = "org.debian.apt.upgrade-packages";

export type AptDaemonRequest =
  | { kind: "install-packages"; packageIds: string[] }
  | { kind: "remove-packages"; packageIds: string[] }
  | { kind: "upgrade-packages"; packageIds: string[] }
  | { kind: "install-file"; filePath: string; force: boolean }
  | { kind: "refresh-cache" };

export type AptDaemonErrorKind =
  | "unavailable"
  | "cancelled"
  | "authentication"
  | "busy"
  | "unsafe"
  | "failed";

export class AptDaemonError extends Error {
  readonly kind: AptDaemonErrorKind;
  readonly technicalDetails?: string;

  constructor(
    kind: AptDaemonErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super(message);
    this.name = "AptDaemonError";
    this.kind = kind;
    this.technicalDetails = technicalDetails;
  }
}

interface AptDaemonInterface extends DBusInterface {
  InstallPackages(packageIds: string[]): DBusPromise<string>;
  RemovePackages(packageIds: string[]): DBusPromise<string>;
  UpgradePackages(packageIds: string[]): DBusPromise<string>;
  InstallFile(filePath: string, force: boolean): DBusPromise<string>;
  UpdateCache(): DBusPromise<string>;
}

interface AptDaemonTransactionInterface extends DBusInterface {
  Simulate(): DBusPromise<void>;
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
      throw new AptDaemonError("cancelled", "Transaction was cancelled");
    }
    const activeBus = getBus();
    const daemon = await getDaemon(activeBus);
    const transactionPath = await createTransaction(daemon, request);
    const transaction = await activeBus.getInterface<AptDaemonTransactionInterface>(
      SERVICE,
      transactionPath,
      TRANSACTION_INTERFACE,
    );
    await runTransaction(transaction, request, options);
  } catch (error) {
    if (error instanceof AptDaemonError) throw error;
    throw classifyAptDaemonDbusError(error);
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

export function classifyAptDaemonOutcome(
  exitState: string,
  error: AptDaemonErrorDetails = {},
): AptDaemonErrorKind | undefined {
  if (exitState === "exit-success") return undefined;
  if (exitState === "exit-cancelled") return "cancelled";

  const details = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/authentication.*cancel/i.test(details)) return "cancelled";
  if (/error-(?:auth-failed|not-authorized)|not authori[sz]ed|authentication/i.test(details)) {
    return "authentication";
  }
  if (/error-no-lock|another package manager|could not get lock|already running/i.test(details)) {
    return "busy";
  }
  return "failed";
}

function getBus(): MessageBus {
  if (bus) return bus;

  bus = systemBus();
  const stream = bus.connection.stream as typeof bus.connection.stream & {
    unref?: () => void;
  };
  stream.unref?.();
  bus.connection.on("error", (error) => {
    console.debug("aptdaemon D-Bus connection failed", error);
  });
  bus.connection.on("handlerError", (error) => {
    console.debug("aptdaemon D-Bus signal handler failed", error);
  });
  return bus;
}

function getDaemon(activeBus: MessageBus): Promise<AptDaemonInterface> {
  daemonPromise ??= Promise.resolve(
    activeBus.getInterface<AptDaemonInterface>(
      SERVICE,
      DAEMON_PATH,
      DAEMON_INTERFACE,
    ),
  );
  return daemonPromise;
}

async function createTransaction(
  daemon: AptDaemonInterface,
  request: AptDaemonRequest,
): Promise<string> {
  switch (request.kind) {
    case "install-packages":
      return await daemon.InstallPackages(request.packageIds);
    case "remove-packages":
      return await daemon.RemovePackages(request.packageIds);
    case "upgrade-packages":
      return await daemon.UpgradePackages(request.packageIds);
    case "install-file":
      return await daemon.InstallFile(request.filePath, request.force);
    case "refresh-cache":
      return await daemon.UpdateCache();
  }
}

async function runTransaction(
  transaction: AptDaemonTransactionInterface,
  request: AptDaemonRequest,
  options: SoftwareOperationOptions,
): Promise<void> {
  let resolveFinished: (exitState: string) => void = () => undefined;
  const finished = new Promise<string>((resolve) => {
    resolveFinished = resolve;
  });
  const onFinished = (exitState: string) => resolveFinished(exitState);
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
  await transaction.$subscribe("Finished", onFinished);
  try {
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

    if (request.kind !== "refresh-cache") {
      await simulateAndPreauthorize(transaction, request, options.signal);
      const simulatedProperties = await transaction.$readAllProps();
      assertSafeSimulation(transaction, request, simulatedProperties);
    }

    await transaction.Run();
    const exitState = await finished;
    const properties = await transaction.$readAllProps();
    const details = parseErrorDetails(properties.Error);
    const outcome = classifyAptDaemonOutcome(exitState, details);
    if (outcome) {
      throw new AptDaemonError(
        outcome,
        details.message ?? `aptdaemon finished with ${exitState}`,
        formatDetails(details),
      );
    }
  } catch (error) {
    if (error instanceof AptDaemonError) throw error;
    throw classifyAptDaemonDbusError(error);
  } finally {
    options.signal?.removeEventListener("abort", requestCancellation);
    await transaction.$unsubscribe("Finished", onFinished).catch(() => undefined);
    if (subscribedToProperties) {
      await transaction.$unsubscribe("PropertyChanged", onPropertyChanged).catch(() => undefined);
    }
  }
}

async function simulateAndPreauthorize(
  transaction: AptDaemonTransactionInterface,
  request: AptDaemonRequest,
  signal?: AbortSignal,
): Promise<void> {
  const authorizationController = new AbortController();
  const authorizationSignal = signal
    ? AbortSignal.any([signal, authorizationController.signal])
    : authorizationController.signal;
  const simulation = transaction.Simulate().catch((error: unknown) => {
    authorizationController.abort();
    throw error;
  });
  const authorization = preauthorize(request, authorizationSignal);
  const [simulationResult, authorizationResult] = await Promise.allSettled([
    simulation,
    authorization,
  ]);

  if (simulationResult.status === "rejected") throw simulationResult.reason;
  if (authorizationResult.status === "rejected") {
    void transaction.Cancel().catch(() => undefined);
    throw authorizationResult.reason;
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
    if (error instanceof ProcessExecutionError && error.result.exitCode === 3) {
      throw new AptDaemonError("cancelled", "Authentication was cancelled");
    }
    if (
      error instanceof ProcessExecutionError &&
      (error.result.exitCode === 1 || error.result.exitCode === 2)
    ) {
      throw new AptDaemonError(
        "authentication",
        "Authentication was denied",
      );
    }
    if (signal.aborted) {
      throw new AptDaemonError("cancelled", "Transaction was cancelled");
    }
    // Let aptdaemon perform its normal authorization check when pkcheck is
    // unavailable or cannot use the desktop authentication agent.
  }
}

function preauthorizationAction(request: AptDaemonRequest): string | undefined {
  if (request.kind === "remove-packages") return INSTALL_REMOVE_ACTION;
  if (request.kind === "upgrade-packages") return UPGRADE_ACTION;
  return undefined;
}

export function parseProcStartTime(stat: string): string | undefined {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 0) return undefined;
  const fields = stat.slice(commandEnd + 1).trim().split(/\s+/);
  const startTime = fields[19];
  return startTime && /^\d+$/.test(startTime) ? startTime : undefined;
}

function assertSafeSimulation(
  transaction: AptDaemonTransactionInterface,
  request: AptDaemonRequest,
  properties: Record<string, unknown>,
): void {
  const unexpected = findUnexpectedAptDaemonRemovals(
    request,
    properties.Packages,
    properties.Dependencies,
  );
  if (unexpected?.length === 0) return;

  void transaction.Cancel().catch(() => undefined);
  if (!unexpected) {
    throw new AptDaemonError(
      "unsafe",
      "APT changes could not be verified safely",
    );
  }
  throw new AptDaemonError(
    "unsafe",
    "The operation was blocked because other software would be removed",
    unexpected.join("\n"),
  );
}

export function findUnexpectedAptDaemonRemovals(
  request: AptDaemonRequest,
  packageGroups: unknown,
  dependencyGroups: unknown,
): string[] | undefined {
  const requestedRemovals = removalIds(packageGroups);
  const dependencyRemovals = removalIds(dependencyGroups);
  if (!requestedRemovals || !dependencyRemovals) return undefined;

  const allowed = request.kind === "remove-packages"
    ? request.packageIds.map(packageIdentityWithoutVersion)
    : [];
  return [...new Set([...requestedRemovals, ...dependencyRemovals])]
    .filter((id) => !isAllowedRemoval(id, allowed));
}

function removalIds(groups: unknown): string[] | undefined {
  if (!Array.isArray(groups)) return undefined;
  const removals = groups[2];
  const purges = groups[3];
  if (!Array.isArray(removals) || !Array.isArray(purges)) return undefined;
  if (![...removals, ...purges].every((value) => typeof value === "string")) {
    return undefined;
  }
  return [...removals, ...purges].map(packageIdentityWithoutVersion);
}

function packageIdentityWithoutVersion(value: string): string {
  return value.split("=", 1)[0] ?? value;
}

function isAllowedRemoval(id: string, allowed: readonly string[]): boolean {
  if (allowed.includes(id)) return true;
  if (id.includes(":")) return false;

  const matchingTargets = allowed.filter(
    (target) => target.split(":", 1)[0] === id,
  );
  return matchingTargets.length === 1;
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

export function classifyAptDaemonDbusError(error: unknown): AptDaemonError {
  const details = error instanceof Error ? error.message : String(error);
  const dbusName = error instanceof DBusError ? error.dbusName ?? "" : "";
  const combined = `${dbusName} ${details}`;

  if (/ServiceUnknown|NameHasNoOwner|ServiceNotFound|NoServer|ECONNREFUSED/i.test(combined)) {
    return new AptDaemonError("unavailable", "aptdaemon is unavailable", details);
  }
  if (/Cancelled|Canceled/i.test(combined)) {
    return new AptDaemonError("cancelled", "Transaction was cancelled", details);
  }
  if (/NotAuthorized|AuthFailed|authentication.*deni/i.test(combined)) {
    return new AptDaemonError(
      "authentication",
      "Authentication was denied",
      details,
    );
  }
  if (/NoLock|another package manager|could not get lock|already running/i.test(combined)) {
    return new AptDaemonError(
      "busy",
      "Another package-management operation is currently running",
      details,
    );
  }
  return new AptDaemonError("failed", "aptdaemon transaction failed", details);
}
