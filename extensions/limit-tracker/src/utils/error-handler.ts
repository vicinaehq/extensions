/**
 * Comprehensive error handling utilities
 * Inspired by CodexBar's detailed error classification
 */

export type ErrorType =
  | "not_configured"
  | "unauthorized"
  | "expired"
  | "network_error"
  | "timeout"
  | "parse_error"
  | "api_error"
  | "rate_limited"
  | "forbidden"
  | "not_found"
  | "server_error"
  | "unknown";

export interface AppError {
  type: ErrorType;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  retryAfterMs?: number;
  source?: string;
}

/**
 * Create a standardized error
 */
export function createError(
  type: ErrorType,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    retryable?: boolean;
    retryAfterMs?: number;
    source?: string;
  },
): AppError {
  return {
    type,
    message,
    ...options,
  };
}

/**
 * Parse HTTP response into an AppError
 */
export function parseHttpError(
  status: number,
  statusText: string,
  responseBody?: string,
): AppError {
  // Rate limiting
  if (status === 429) {
    const retryAfter = parseRetryAfter(responseBody);
    return createError("rate_limited", `Rate limited: ${statusText}`, {
      retryable: true,
      retryAfterMs: retryAfter,
    });
  }

  // Authentication errors
  if (status === 401) {
    return createError("unauthorized", "Authentication required. Please check your credentials.", {
      retryable: false,
    });
  }

  if (status === 403) {
    return createError("forbidden", "Access denied. Your credentials may lack required permissions.", {
      retryable: false,
    });
  }

  // Not found
  if (status === 404) {
    return createError("not_found", "Resource not found.", {
      retryable: false,
    });
  }

  // Server errors (retryable)
  if (status >= 500) {
    return createError("server_error", `Server error: ${status} ${statusText}`, {
      retryable: true,
      retryAfterMs: 5000,
    });
  }

  // Other client errors
  return createError("api_error", `HTTP ${status}: ${statusText}`, {
    retryable: false,
    details: responseBody ? { response: responseBody.slice(0, 500) } : undefined,
  });
}

/**
 * Parse Retry-After header or response body
 */
function parseRetryAfter(responseBody?: string): number | undefined {
  if (!responseBody) return undefined;

  try {
    const parsed = JSON.parse(responseBody);
    if (typeof parsed.retry_after === "number") {
      return parsed.retry_after * 1000;
    }
    if (typeof parsed.retryAfter === "number") {
      return parsed.retryAfter * 1000;
    }
  } catch {
    // Not JSON, ignore
  }

  return undefined;
}

/**
 * Wrap an async operation with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    retryDelayMs?: number;
    onError?: (error: AppError) => void;
  },
): Promise<{ data: T | null; error: AppError | null }> {
  const { retries = 0, retryDelayMs = 1000, onError } = options ?? {};

  let lastError: AppError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await operation();
      return { data, error: null };
    } catch (err) {
      lastError = normalizeError(err);

      if (onError) {
        onError(lastError);
      }

      // Check if we should retry
      if (attempt < retries && lastError.retryable) {
        const delay = lastError.retryAfterMs ?? retryDelayMs * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  return { data: null, error: lastError };
}

/**
 * Normalize any error into an AppError
 */
export function normalizeError(err: unknown): AppError {
  if (isAppError(err)) {
    return err;
  }

  if (err instanceof Error) {
    // Network errors
    if (err.name === "AbortError" || err.message.includes("timeout")) {
      return createError("timeout", "Request timed out. Please check your network connection.", {
        retryable: true,
      });
    }

    if (err.message.includes("fetch") || err.message.includes("network")) {
      return createError("network_error", err.message, {
        retryable: true,
      });
    }

    return createError("unknown", err.message);
  }

  return createError("unknown", "An unexpected error occurred");
}

/**
 * Check if an error is an AppError
 */
export function isAppError(err: unknown): err is AppError {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    "message" in err &&
    typeof (err as AppError).type === "string" &&
    typeof (err as AppError).message === "string"
  );
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create user-friendly error messages
 */
export function getUserFriendlyMessage(error: AppError): string {
  switch (error.type) {
    case "not_configured":
      return "This service is not configured. Please add your credentials in extension settings.";
    case "unauthorized":
    case "expired":
      return "Your session has expired. Please sign in again or update your credentials.";
    case "rate_limited":
      return "Too many requests. Please wait a moment and try again.";
    case "timeout":
      return "The request timed out. Please check your network connection and try again.";
    case "network_error":
      return "Network error. Please check your internet connection.";
    case "server_error":
      return "The service is temporarily unavailable. Please try again later.";
    default:
      return error.message;
  }
}

/**
 * Create error for missing credentials
 */
export function missingCredentialsError(providerName: string, setupUrl?: string): AppError {
  const message = setupUrl
    ? `${providerName} is not configured. Please add your credentials in extension settings or visit ${setupUrl}.`
    : `${providerName} is not configured. Please add your credentials in extension settings.`;

  return createError("not_configured", message);
}

/**
 * Create error for expired token
 */
export function expiredTokenError(providerName: string): AppError {
  return createError(
    "expired",
    `${providerName} session expired. Please sign in again or update your credentials.`,
  );
}

/**
 * Create error for network issues
 */
export function networkError(context?: string): AppError {
  const message = context
    ? `Network error: ${context}. Please check your internet connection.`
    : "Network error. Please check your internet connection.";
  return createError("network_error", message, { retryable: true });
}
