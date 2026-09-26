import {
  DBusError,
  type DBusInterface,
  type DBusPromise,
  type MessageBus,
  systemBus,
  variantValue,
} from "dbus-native";
import type {
  SoftwareOperationOptions,
  SoftwareOperationProgress,
} from "../types.ts";

const SERVICE = "org.debian.apt";
const DAEMON_PATH = "/org/debian/apt";
const DAEMON_INTERFACE = "org.debian.apt";
const TRANSACTION_INTERFACE = "org.debian.apt.transaction";

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
    await runTransaction(transaction, options);
  } catch (error) {
    if (error instanceof AptDaemonError) throw error;
    throw classifyDbusError(error);
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
  options: SoftwareOperationOptions,
): Promise<void> {
  let resolveFinished: (exitState: string) => void = () => undefined;
  const finished = new Promise<string>((resolve) => {
    resolveFinished = resolve;
  });
  const onFinished = (exitState: string) => resolveFinished(exitState);
  let status = "status-setting-up";
  let progress: number | undefined;
  let cancellable = false;
  let cancellationRequested = false;

  const reportProgress = () => {
    const update: SoftwareOperationProgress = {
      message: describeAptDaemonStatus(status),
      cancellable,
    };
    if (progress !== undefined) update.percent = progress;
    try {
      options.onProgress?.(update);
    } catch (error) {
      console.debug("APT progress callback failed", error);
    }
  };

  const requestCancellation = () => {
    cancellationRequested = true;
    if (!cancellable) return;
    cancellable = false;
    reportProgress();
    void transaction.Cancel().catch((error: unknown) => {
      console.debug("APT transaction could not be cancelled", error);
    });
  };

  const onPropertyChanged = (propertyName: string, encodedValue: unknown) => {
    const value = variantValue(encodedValue);
    if (propertyName === "Status" && typeof value === "string") {
      status = value;
    } else if (propertyName === "Progress" && typeof value === "number") {
      progress = normalizeProgress(value);
    } else if (propertyName === "Cancellable" && typeof value === "boolean") {
      cancellable = value;
      if (cancellationRequested && cancellable) requestCancellation();
    } else {
      return;
    }
    reportProgress();
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
    if (typeof initialProperties.Progress === "number") {
      progress = normalizeProgress(initialProperties.Progress);
    }
    cancellable = initialProperties.Cancellable === true;
    reportProgress();
    if (options.signal?.aborted) requestCancellation();

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
    throw classifyDbusError(error);
  } finally {
    options.signal?.removeEventListener("abort", requestCancellation);
    await transaction.$unsubscribe("Finished", onFinished).catch(() => undefined);
    if (subscribedToProperties) {
      await transaction.$unsubscribe("PropertyChanged", onPropertyChanged).catch(() => undefined);
    }
  }
}

function normalizeProgress(value: number): number | undefined {
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined;
  return Math.round(value);
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

function classifyDbusError(error: unknown): AptDaemonError {
  const details = error instanceof Error ? error.message : String(error);
  const dbusName = error instanceof DBusError ? error.dbusName ?? "" : "";
  const combined = `${dbusName} ${details}`;

  if (/ServiceUnknown|NameHasNoOwner|ServiceNotFound|NoServer|ECONNREFUSED/i.test(combined)) {
    return new AptDaemonError("unavailable", "aptdaemon is unavailable", details);
  }
  if (/NotAuthorized|AuthFailed|authentication.*(?:cancel|deni)/i.test(combined)) {
    return new AptDaemonError(
      "authentication",
      "Authentication was cancelled or denied",
      details,
    );
  }
  if (/Cancelled|Canceled/i.test(combined)) {
    return new AptDaemonError("cancelled", "Transaction was cancelled", details);
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
