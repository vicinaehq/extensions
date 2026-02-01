import { ValidationError, ValidationErrors } from "./types";

/**
 * Validates Google Workspace API credentials
 * @throws {ValidationError} When credentials are invalid
 */
export function validateCredentials(
  credentials: Record<string, unknown>,
): void {
  if (!credentials || typeof credentials !== "object") {
    throw new ValidationError(
      "Credentials must be an object",
      "INVALID_CREDENTIALs" as ValidationErrors,
    );
  }

  const clientId = credentials["client_id"];
  if (
    !clientId ||
    typeof clientId !== "string" ||
    (clientId as string).trim() === ""
  ) {
    throw new ValidationError(
      "Client ID is required",
      "INVALID_CREDENTIALs" as ValidationErrors,
    );
  }

  const clientSecret = credentials["client_secret"];
  if (
    !clientSecret ||
    typeof clientSecret !== "string" ||
    (clientSecret as string).trim() === ""
  ) {
    throw new ValidationError(
      "Client Secret is required",
      "INVALID_CREDENTIALs" as ValidationErrors,
    );
  }

  const refreshToken = credentials["refresh_token"];
  if (
    !refreshToken ||
    typeof refreshToken !== "string" ||
    (refreshToken as string).trim() === ""
  ) {
    throw new ValidationError(
      "Refresh Token is required",
      "INVALID_CREDENTIALs" as ValidationErrors,
    );
  }
}

/**
 * Validates Google API URL
 * @throws {ValidationError} When URL is invalid
 */
export function validateApiUrl(url: string): void {
  if (!url || typeof url !== "string" || (url as string).trim() === "") {
    throw new ValidationError(
      "API URL is required",
      "INVALID_URL" as ValidationErrors,
    );
  }

  if (!url.match(/^https?:\/\/.+$/)) {
    throw new ValidationError(
      "API URL must start with http:// or https://",
      "INVALID_URL" as ValidationErrors,
    );
  }

  if (!url.includes(".googleapis.com") && !url.includes("api.google.com")) {
    throw new ValidationError(
      "Invalid Google API URL",
      "INVALID_URL" as ValidationErrors,
    );
  }
}

/**
 * Validates a command input
 * @throws {ValidationError} When command is invalid
 */
export function validateCommand(command: string): void {
  if (
    !command ||
    typeof command !== "string" ||
    (command as string).trim() === ""
  ) {
    throw new ValidationError(
      "Command is required",
      "INVALID_COMMAND" as ValidationErrors,
    );
  }

  // Prevent dangerous commands
  const dangerousPatterns = [
    /rm\s+-rf/i,
    /sudo/i,
    /chmod\s+777/i,
    /mv\s+\/\//i,
    /dd\s+if=/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      throw new ValidationError(
        "Command contains potentially dangerous operations",
        "INVALID_COMMAND" as ValidationErrors,
      );
    }
  }
}

/**
 * Validates configuration object
 * @throws {ValidationError} When configuration is invalid
 */
export function validateConfig(config: Record<string, unknown>): void {
  const url = config["url"] as string;
  const credentials = config["credentials"];

  if (url) {
    validateApiUrl(url);
  }

  if (credentials) {
    validateCredentials(credentials as Record<string, unknown>);
  }
}

/**
 * Validates an entity ID
 * @throws {ValidationError} When entity ID is invalid
 */
export function validateEntityId(entityId: string): void {
  if (!entityId || typeof entityId !== "string") {
    throw new ValidationError(
      "Entity ID is required",
      "INVALID_COMMAND" as ValidationErrors,
    );
  }

  const parts = entityId.split(".");
  if (parts.length < 2) {
    throw new ValidationError(
      'Invalid entity ID format. Expected: "service.identifier"',
      "INVALID_COMMAND" as ValidationErrors,
    );
  }

  // Validate service name
  const service = parts[0] as string;
  const validServices = [
    "gmail",
    "calendar",
    "drive",
    "contacts",
    "tasks",
    "sheets",
    "docs",
    "slides",
    "people",
    "groups",
    "chat",
    "classroom",
  ];

  if (!validServices.includes(service)) {
    throw new ValidationError(
      `Invalid service: ${service}. Must be one of: ${validServices.join(", ")}`,
      "INVALID_COMMAND" as ValidationErrors,
    );
  }
}

/**
 * Validates timeout value
 * @throws {ValidationError} When timeout is invalid
 */
export function validateTimeout(timeout: number): void {
  if (typeof timeout !== "number" || timeout <= 0) {
    throw new ValidationError(
      "Timeout must be a positive number",
      "INVALID_COMMAND" as ValidationErrors,
    );
  }

  if (timeout > 60000) {
    throw new ValidationError(
      "Timeout cannot exceed 60,000ms",
      "INVALID_COMMAND" as ValidationErrors,
    );
  }
}

/**
 * Validates retry count
 * @throws {ValidationError} When retry count is invalid
 */
export function validateRetries(retries: number): void {
  if (typeof retries !== "number" || retries < 0) {
    throw new ValidationError(
      "Retry count must be a non-negative number",
      "INVALID_COMMAND" as ValidationErrors,
    );
  }

  if (retries > 10) {
    throw new ValidationError(
      "Retry count cannot exceed 10",
      "INVALID_COMMAND" as ValidationErrors,
    );
  }
}
