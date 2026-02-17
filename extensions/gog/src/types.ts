/**
 * Represents API call options for error handling and feedback
 */
export interface ApiCallOptions {
  successMessage?: string;
  errorMessage?: string;
  timeout?: number;
  retries?: number;
}

/**
 * Represents service item actions for API calls
 */
export interface ServiceItemActions {
  getCommand: string;
  successMessage?: string;
  errorMessage?: string;
}

/**
 * Represents API response with error handling
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

/**
 * Represents configuration validation errors
 */
export type ValidationErrors =
  | "INVALID_CREDENTIALs"
  | "INVALID_URL"
  | "INVALID_COMMAND"
  | "MISSing_CREDENTIALS";

/**
 * Configuration validation error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public errorType: ValidationErrors,
  ) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when gog CLI is not installed
 */
export class GogNotInstalledError extends Error {
  constructor() {
    super(
      "gog CLI not found. Please install gog CLI from https://github.com/steipete/gogcli",
    );
    this.name = "GogNotInstalledError";
  }
}

/**
 * Error thrown when API call fails
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
