import {
  HAEntity,
  HAConfig,
  HAError,
  NetworkError,
  AuthenticationError,
  ValidationError,
} from "./types";

const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Validates Home Assistant configuration
 * @throws {ValidationError} When configuration is invalid
 */
export function validateConfig(config: HAConfig): void {
  if (!config.url || config.url.trim().length === 0) {
    throw new ValidationError("Home Assistant URL is required", "MISSING_URL");
  }

  if (!config.url.match(/^https?:\/\/.+/)) {
    throw new ValidationError(
      "Home Assistant URL must start with http:// or https://",
      "INVALID_URL",
    );
  }

  if (!config.token || config.token.trim().length === 0) {
    throw new ValidationError(
      "Long-lived access token is required",
      "MISSING_TOKEN",
    );
  }

  if (config.token.length < 10) {
    throw new ValidationError(
      "Access token appears to be too short. Please check your token.",
      "INVALID_TOKEN",
    );
  }
}

/**
 * Fetches all entities from Home Assistant API
 * @param config Home Assistant configuration
 * @param timeout Request timeout in milliseconds (default: 10000)
 * @returns Array of entities
 * @throws {NetworkError} When network request fails
 * @throws {AuthenticationError} When authentication fails
 * @throws {TimeoutError} When request times out
 * @throws {HAError} When API returns an error
 */
export async function fetchEntities(
  config: HAConfig,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<HAEntity[]> {
  validateConfig(config);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${config.url}/api/states`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(
          `Authentication failed: ${response.status} ${response.statusText}`,
        );
      }
      throw new HAError(
        `HA API error: ${response.status} ${response.statusText}`,
        "API_ERROR",
        response.status,
      );
    }

    return response.json();
  } catch (err) {
    clearTimeout(timeoutId);

    const error = err as Error | NetworkError | HAError | SyntaxError | unknown;

    if (
      error instanceof NetworkError ||
      (error as Error & { name: string }).name === "AbortError"
    ) {
      throw new NetworkError(
        `Failed to connect to Home Assistant at ${config.url}`,
        error instanceof NetworkError ? error.statusCode : undefined,
      );
    }

    if (error instanceof AuthenticationError) {
      throw error;
    }

    if (error instanceof HAError) {
      throw error;
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      throw new HAError(
        `Failed to parse API response: ${error.message}`,
        "API_ERROR",
      );
    }

    // Handle other unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new HAError(
      `Unexpected error fetching entities: ${errorMessage}`,
      "API_ERROR",
    );
  }
}

/**
 * Toggles an entity's state
 * @param entityId The entity to toggle (e.g., "light.living_room")
 * @param config Home Assistant configuration
 * @returns Void on success
 * @throws {ValidationError} When entity ID is invalid
 * @throws {NetworkError} When network request fails
 * @throws {AuthenticationError} When authentication fails
 * @throws {HAError} When API returns an error
 */
export async function toggleEntity(
  entityId: string,
  config: HAConfig,
): Promise<void> {
  validateConfig(config);

  const domain = extractDomain(entityId);
  if (!domain) {
    throw new ValidationError(
      'Invalid entity ID format. Expected: "domain.entity_id"',
      "INVALID_URL",
    );
  }

  const response = await fetch(`${config.url}/api/services/${domain}/toggle`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: entityId }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        `Authentication failed: ${response.status} ${response.statusText}`,
      );
    }
    throw new HAError(
      `Failed to toggle entity ${entityId}: ${response.status} ${response.statusText}`,
      "API_ERROR",
      response.status,
    );
  }
}

/**
 * Turns on an entity
 * @param entityId The entity to turn on
 * @param config Home Assistant configuration
 * @returns Void on success
 * @throws {ValidationError} When entity ID is invalid
 * @throws {NetworkError} When network request fails
 * @throws {AuthenticationError} When authentication fails
 * @throws {HAError} When API returns an error
 */
export async function turnOnEntity(
  entityId: string,
  config: HAConfig,
): Promise<void> {
  validateConfig(config);

  const domain = extractDomain(entityId);
  if (!domain) {
    throw new ValidationError(
      'Invalid entity ID format. Expected: "domain.entity_id"',
      "INVALID_URL",
    );
  }

  const response = await fetch(`${config.url}/api/services/${domain}/turn_on`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: entityId }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        `Authentication failed: ${response.status} ${response.statusText}`,
      );
    }
    throw new HAError(
      `Failed to turn on entity ${entityId}: ${response.status} ${response.statusText}`,
      "API_ERROR",
      response.status,
    );
  }
}

/**
 * Turns off an entity
 * @param entityId The entity to turn off
 * @param config Home Assistant configuration
 * @returns Void on success
 * @throws {ValidationError} When entity ID is invalid
 * @throws {NetworkError} When network request fails
 * @throws {AuthenticationError} When authentication fails
 * @throws {HAError} When API returns an error
 */
export async function turnOffEntity(
  entityId: string,
  config: HAConfig,
): Promise<void> {
  validateConfig(config);

  const domain = extractDomain(entityId);
  if (!domain) {
    throw new ValidationError(
      'Invalid entity ID format. Expected: "domain.entity_id"',
      "INVALID_URL",
    );
  }

  const response = await fetch(
    `${config.url}/api/services/${domain}/turn_off`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entity_id: entityId }),
    },
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        `Authentication failed: ${response.status} ${response.statusText}`,
      );
    }
    throw new HAError(
      `Failed to turn off entity ${entityId}: ${response.status} ${response.statusText}`,
      "API_ERROR",
      response.status,
    );
  }
}

/**
 * Opens a cover entity (e.g., blinds, curtains)
 * @param entityId The cover entity to open
 * @param config Home Assistant configuration
 * @returns Void on success
 * @throws {ValidationError} When entity ID is invalid
 * @throws {NetworkError} When network request fails
 * @throws {AuthenticationError} When authentication fails
 * @throws {HAError} When API returns an error
 */
export async function openCover(
  entityId: string,
  config: HAConfig,
): Promise<void> {
  validateConfig(config);

  const domain = extractDomain(entityId);
  if (!domain || domain !== "cover") {
    throw new ValidationError(
      'openCover only works with cover entities (e.g., "cover.blinds")',
      "INVALID_URL",
    );
  }

  const response = await fetch(`${config.url}/api/services/cover/open_cover`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: entityId }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        `Authentication failed: ${response.status} ${response.statusText}`,
      );
    }
    throw new HAError(
      `Failed to open cover ${entityId}: ${response.status} ${response.statusText}`,
      "API_ERROR",
      response.status,
    );
  }
}

/**
 * Closes a cover entity
 * @param entityId The cover entity to close
 * @param config Home Assistant configuration
 * @returns Void on success
 * @throws {ValidationError} When entity ID is invalid
 * @throws {NetworkError} When network request fails
 * @throws {AuthenticationError} When authentication fails
 * @throws {HAError} When API returns an error
 */
export async function closeCover(
  entityId: string,
  config: HAConfig,
): Promise<void> {
  validateConfig(config);

  const domain = extractDomain(entityId);
  if (!domain || domain !== "cover") {
    throw new ValidationError(
      'closeCover only works with cover entities (e.g., "cover.blinds")',
      "INVALID_URL",
    );
  }

  const response = await fetch(`${config.url}/api/services/cover/close_cover`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: entityId }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        `Authentication failed: ${response.status} ${response.statusText}`,
      );
    }
    throw new HAError(
      `Failed to close cover ${entityId}: ${response.status} ${response.statusText}`,
      "API_ERROR",
      response.status,
    );
  }
}

/**
 * Stops a cover entity
 * @param entityId The cover entity to stop
 * @param config Home Assistant configuration
 * @returns Void on success
 * @throws {ValidationError} When entity ID is invalid
 * @throws {NetworkError} When network request fails
 * @throws {AuthenticationError} When authentication fails
 * @throws {HAError} When API returns an error
 */
export async function stopCover(
  entityId: string,
  config: HAConfig,
): Promise<void> {
  validateConfig(config);

  const domain = extractDomain(entityId);
  if (!domain || domain !== "cover") {
    throw new ValidationError(
      'stopCover only works with cover entities (e.g., "cover.blinds")',
      "INVALID_URL",
    );
  }

  const response = await fetch(`${config.url}/api/services/cover/stop_cover`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: entityId }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        `Authentication failed: ${response.status} ${response.statusText}`,
      );
    }
    throw new HAError(
      `Failed to stop cover ${entityId}: ${response.status} ${response.statusText}`,
      "API_ERROR",
      response.status,
    );
  }
}

/**
 * Extracts the domain from an entity ID
 * @param entityId Entity ID (e.g., "light.living_room")
 * @returns Domain portion or null if invalid
 */
function extractDomain(entityId: string): string | null {
  const parts = entityId.split(".");
  if (parts.length < 2) {
    return null;
  }
  return parts[0] as string;
}
