import { showToast, Toast } from "@vicinae/api";

/**
 * Extracts a human-readable message from an unknown thrown value.
 */
export function errorMessage(error: unknown, fallback = "Unknown error"): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Shows a failure toast, deriving the message from a thrown value when given.
 */
export async function showFailureToast(title: string, error?: unknown): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title,
    ...(error === undefined ? {} : { message: errorMessage(error) }),
  });
}
