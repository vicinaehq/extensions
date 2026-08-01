import { showToast, Toast } from "@vicinae/api";

/**
 * Reports a caught exception to the user, preferring the underlying message
 * and falling back to advice when the thrown value carries none.
 */
export async function reportError(
	title: string,
	error: unknown,
	fallback?: string,
): Promise<void> {
	await showToast({
		style: Toast.Style.Failure,
		title,
		message: error instanceof Error ? error.message : fallback,
	});
}
