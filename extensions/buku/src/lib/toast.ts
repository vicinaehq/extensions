import { Toast, showToast } from "@vicinae/api";
import { BUKU_MISSING_HINT, isBukuMissing } from "./buku";

/**
 * Picks the most informative message out of a thrown value.
 * Errors from `execFile` carry buku's own complaint on `stderr`, which is far more
 * useful than the generic "Command failed" of `message`.
 */
export function describeError(detail: unknown): string {
  const { stderr, stdout, message } = (detail ?? {}) as Record<string, unknown>;

  return String(stderr || stdout || message || detail || "").trim();
}

export function showSuccess(title: string, message?: string) {
  return showToast({ style: Toast.Style.Success, title, message });
}

/** `detail` accepts a caught error as well as a plain explanation string. */
export function showFailure(title: string, detail?: unknown) {
  return showToast({
    style: Toast.Style.Failure,
    title,
    message: detail === undefined ? undefined : describeError(detail),
  });
}

/**
 * Reports a failed buku call, replacing the opaque `spawn buku ENOENT` with something
 * the user can act on when buku simply is not installed.
 */
export function showBukuFailure(title: string, error: unknown) {
  return isBukuMissing(error) ? showFailure("buku not found", BUKU_MISSING_HINT) : showFailure(title, error);
}
