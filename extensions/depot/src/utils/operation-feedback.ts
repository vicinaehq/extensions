import { Toast, sendDesktopNotification, showToast } from "@vicinae/api";
import {
  describeOperationError,
  isOperationCancelled,
  type OperationFailure,
} from "../errors.ts";
import {
  recordRecentAction,
  type NewRecentAction,
} from "../recent-actions.ts";
import type { SoftwareOperationStatus } from "../types.ts";

const SUCCESS_TOAST_DURATION_MS = 5_000;
const TOAST_DETAIL_LIMIT = 200;

export interface OperationFeedback {
  status: "success" | "failure";
  title: string;
  message: string;
}

export function reportOperationResult(
  toast: Toast,
  feedback: OperationFeedback,
): void {
  toast.style = feedback.status === "success"
    ? Toast.Style.Success
    : Toast.Style.Failure;
  toast.title = feedback.title;
  toast.message = feedback.message;
  void toast.update()
    .then(() => {
      // Failures stay visible until replaced or dismissed so they can be read.
      if (feedback.status === "success") dismissCompletedToast(toast);
    })
    .catch((error: unknown) => {
      console.debug("Operation result could not be displayed", error);
    });

  void sendDesktopNotification({
    title: feedback.title,
    body: feedback.message,
    // High-urgency GNOME notifications remain until explicitly dismissed.
    // Detailed failures stay available in Depot, so normal urgency is enough.
    urgency: "Normal",
  }).catch((error: unknown) => {
    console.debug("Desktop notification could not be delivered", error);
  });
}

export type FailedActionRecord = Omit<
  NewRecentAction,
  "kind" | "summary" | "details"
>;

export interface OperationFailureOptions {
  /** Recorded as a failed Recent Action with its technical details. */
  recent?: FailedActionRecord;
  /** Shown when the backend provided no technical detail. */
  message?: string;
}

/**
 * Reports a failed operation consistently: cancellations close the toast,
 * other failures show the backend's last diagnostic line and are recorded in
 * Recent Actions with the full bounded details.
 *
 * Returns the failure, or undefined when the user cancelled.
 */
export async function reportOperationFailure(
  toast: Toast,
  error: unknown,
  fallback: string,
  options: OperationFailureOptions = {},
): Promise<OperationFailure | undefined> {
  if (isOperationCancelled(error)) {
    await toast.hide().catch(() => undefined);
    return undefined;
  }

  console.error(fallback, error);
  const failure = describeOperationError(error, fallback);
  if (options.recent) {
    await recordRecentAction({
      ...options.recent,
      kind: "failed",
      summary: failure.message,
      details: failure.details,
    });
  }

  reportOperationResult(toast, {
    status: "failure",
    title: failure.message,
    message: failureToastMessage(failure, options),
  });
  return failure;
}

function failureToastMessage(
  failure: OperationFailure,
  options: OperationFailureOptions,
): string {
  const detail = lastDiagnosticLine(failure.details);
  if (detail) {
    return options.recent
      ? `${detail} · Details in Recent Actions`
      : detail;
  }
  return options.message ?? "";
}

function lastDiagnosticLine(details: string | undefined): string | undefined {
  const line = details
    ?.split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) return undefined;
  return line.length > TOAST_DETAIL_LIMIT
    ? `${line.slice(0, TOAST_DETAIL_LIMIT - 1)}…`
    : line;
}

/** Explains why an action did nothing while another operation holds the lock. */
export async function showOperationBusy(
  message = "Wait for the current package operation to finish",
): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title: "Another package operation is running",
    message,
  });
}

function dismissCompletedToast(toast: Toast): void {
  setTimeout(() => {
    void toast.hide().catch((error: unknown) => {
      console.debug("Completed operation toast could not be dismissed", error);
    });
  }, SUCCESS_TOAST_DURATION_MS);
}

export function updateOperationToast(
  toast: Toast,
  status: SoftwareOperationStatus,
): void {
  const message = status.message;
  if (toast.message === message) return;
  toast.message = message;
  void toast.update().catch((error: unknown) => {
    console.debug("Operation status could not be displayed", error);
  });
}
