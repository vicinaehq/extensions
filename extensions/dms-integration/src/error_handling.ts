export type ApiError = { title: string; detail: string };
export type ErrorWithCode = { code?: string; message?: string };

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "title" in error &&
    typeof (error as { title: unknown }).title === "string" &&
    "detail" in error &&
    typeof (error as { detail: unknown }).detail === "string"
  );
}
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return `${error.title}: ${error.detail}`;
  }

  if (error instanceof Error) {
    const code =
      typeof (error as ErrorWithCode).code === "string"
        ? (error as ErrorWithCode).code
        : undefined;

    if (code === "ECONNREFUSED") {
      return "Cannot connect to DMS backend (connection refused). Is the server running?";
    }
    return error.message || "Unknown error";
  }

  return "Unknown error";
}
