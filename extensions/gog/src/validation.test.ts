import { describe, it, expect } from "vitest";
import {
	validateCredentials,
	validateApiUrl,
	validateCommand,
	validateConfig,
	validateEntityId,
	validateTimeout,
	validateRetries,
} from "./validation";

// Helper to check if thrown error is a ValidationError
function expectValidationError(fn: () => void, messageMatch?: string): void {
	let thrown: Error | null = null;
	try {
		fn();
	} catch (e) {
		thrown = e as Error;
	}
	expect(thrown).not.toBeNull();
	expect(thrown?.name).toBe("ValidationError");
	if (messageMatch) {
		expect(thrown?.message).toContain(messageMatch);
	}
}

describe("validateCredentials", () => {
	describe("valid credentials", () => {
		it("should accept valid credentials object", () => {
			const credentials = {
				client_id: "test-client-id",
				client_secret: "test-client-secret",
				refresh_token: "test-refresh-token",
			};

			expect(() => validateCredentials(credentials)).not.toThrow();
		});

		it("should accept credentials with whitespace", () => {
			const credentials = {
				client_id: "  test-client-id  ",
				client_secret: "  test-client-secret  ",
				refresh_token: "  test-refresh-token  ",
			};

			expect(() => validateCredentials(credentials)).not.toThrow();
		});
	});

	describe("invalid credentials", () => {
		it("should throw error for missing client_id", () => {
			const credentials = {
				client_secret: "test-client-secret",
				refresh_token: "test-refresh-token",
			};

			expectValidationError(
				() => validateCredentials(credentials),
				"Client ID",
			);
		});

		it("should throw error for empty client_id", () => {
			const credentials = {
				client_id: "",
				client_secret: "test-client-secret",
				refresh_token: "test-refresh-token",
			};

			expectValidationError(
				() => validateCredentials(credentials),
				"Client ID",
			);
		});

		it("should throw error for whitespace-only client_id", () => {
			const credentials = {
				client_id: "   ",
				client_secret: "test-client-secret",
				refresh_token: "test-refresh-token",
			};

			expectValidationError(() => validateCredentials(credentials));
		});

		it("should throw error for missing client_secret", () => {
			const credentials = {
				client_id: "test-client-id",
				refresh_token: "test-refresh-token",
			};

			expectValidationError(
				() => validateCredentials(credentials),
				"Client Secret",
			);
		});

		it("should throw error for missing refresh_token", () => {
			const credentials = {
				client_id: "test-client-id",
				client_secret: "test-client-secret",
			};

			expectValidationError(
				() => validateCredentials(credentials),
				"Refresh Token",
			);
		});

		it("should throw error for invalid credentials type", () => {
			expectValidationError(() =>
				validateCredentials(null as unknown as Record<string, unknown>),
			);
			expectValidationError(() =>
				validateCredentials(undefined as unknown as Record<string, unknown>),
			);
			expectValidationError(() =>
				validateCredentials("" as unknown as Record<string, unknown>),
			);
			expectValidationError(() =>
				validateCredentials(123 as unknown as Record<string, unknown>),
			);
			expectValidationError(() =>
				validateCredentials([] as unknown as Record<string, unknown>),
			);
		});
	});
});

describe("validateApiUrl", () => {
	describe("valid URLs", () => {
		it("should accept https URLs with .googleapis.com", () => {
			const url = "https://gmail.googleapis.com/v1";

			expect(() => validateApiUrl(url)).not.toThrow();
		});

		it("should accept http URLs with .googleapis.com", () => {
			const url = "http://gmail.googleapis.com/v1";

			expect(() => validateApiUrl(url)).not.toThrow();
		});

		it("should accept URLs with api.google.com", () => {
			const url = "https://api.google.com/v1";

			expect(() => validateApiUrl(url)).not.toThrow();
		});

		it("should accept URLs with calendar.googleapis.com", () => {
			const url = "https://calendar.googleapis.com/v1";

			expect(() => validateApiUrl(url)).not.toThrow();
		});
	});

	describe("invalid URLs", () => {
		it("should throw error for missing URL", () => {
			expectValidationError(() => validateApiUrl(""));
			expectValidationError(() => validateApiUrl(null as unknown as string));
			expectValidationError(() =>
				validateApiUrl(undefined as unknown as string),
			);
		});

		it("should throw error for whitespace-only URL", () => {
			const url = "   ";

			expectValidationError(() => validateApiUrl(url));
		});

		it("should throw error for invalid protocol", () => {
			const url = "ftp://api.example.com/v1";

			expectValidationError(() => validateApiUrl(url), "http:// or https://");
		});

		it("should throw error for missing domain", () => {
			const url = "https:///v1";

			expectValidationError(() => validateApiUrl(url));
		});

		it("should throw error for invalid Google API URL", () => {
			const url = "https://api.example.com/v1";

			expectValidationError(() => validateApiUrl(url), "Google API");
		});
	});
});

describe("validateCommand", () => {
	describe("valid commands", () => {
		it("should accept valid API commands", () => {
			const command = "gog gmail list --user me";

			expect(() => validateCommand(command)).not.toThrow();
		});

		it("should accept commands with flags", () => {
			const command = "gog calendar list --user me --max-results 10";

			expect(() => validateCommand(command)).not.toThrow();
		});

		it("should accept commands with entity IDs", () => {
			const command = "gog tasks list --user me --list default";

			expect(() => validateCommand(command)).not.toThrow();
		});
	});

	describe("invalid commands", () => {
		it("should throw error for missing command", () => {
			expectValidationError(() => validateCommand(""));
			expectValidationError(() => validateCommand(null as unknown as string));
			expectValidationError(() =>
				validateCommand(undefined as unknown as string),
			);
		});

		it("should throw error for whitespace-only command", () => {
			const command = "   ";

			expectValidationError(() => validateCommand(command));
		});

		it("should throw error for rm -rf command", () => {
			const command = "rm -rf /";

			expectValidationError(() => validateCommand(command), "dangerous");
		});

		it("should throw error for sudo command", () => {
			const command = "sudo apt-get install";

			expectValidationError(() => validateCommand(command), "dangerous");
		});

		it("should throw error for chmod command", () => {
			const command = "chmod 777 /tmp";

			expectValidationError(() => validateCommand(command), "dangerous");
		});

		it("should throw error for mv command", () => {
			const command = "mv // /";

			expectValidationError(() => validateCommand(command), "dangerous");
		});
	});
});

describe("validateConfig", () => {
	describe("valid configurations", () => {
		it("should accept valid configuration", () => {
			const config = {
				url: "https://gmail.googleapis.com/v1",
				credentials: {
					client_id: "test-client-id",
					client_secret: "test-client-secret",
					refresh_token: "test-refresh-token",
				},
			};

			expect(() => validateConfig(config)).not.toThrow();
		});

		it("should accept configuration with partial data", () => {
			const config = {
				url: "https://gmail.googleapis.com/v1",
			};

			expect(() => validateConfig(config)).not.toThrow();
		});

		it("should accept empty configuration", () => {
			const config = {};

			// Empty config is valid - no url or credentials to validate
			expect(() => validateConfig(config)).not.toThrow();
		});
	});

	describe("invalid configurations", () => {
		it("should throw error for invalid URL", () => {
			const config = {
				url: "invalid-url",
				credentials: {
					client_id: "test-client-id",
					client_secret: "test-client-secret",
					refresh_token: "test-refresh-token",
				},
			};

			expectValidationError(() => validateConfig(config), "API URL");
		});

		it("should throw error for invalid credentials", () => {
			const config = {
				url: "https://gmail.googleapis.com/v1",
				credentials: {
					client_id: "",
					client_secret: "test-client-secret",
					refresh_token: "test-refresh-token",
				},
			};

			expectValidationError(() => validateConfig(config), "Client ID");
		});
	});
});

describe("validateEntityId", () => {
	describe("valid entity IDs", () => {
		it("should accept valid Gmail entity IDs", () => {
			const entityId = "gmail.message-id";

			expect(() => validateEntityId(entityId)).not.toThrow();
		});

		it("should accept valid Calendar entity IDs", () => {
			const entityId = "calendar.event-id";

			expect(() => validateEntityId(entityId)).not.toThrow();
		});

		it("should accept valid Drive entity IDs", () => {
			const entityId = "drive.file-id";

			expect(() => validateEntityId(entityId)).not.toThrow();
		});
	});

	describe("invalid entity IDs", () => {
		it("should throw error for missing entity ID", () => {
			expectValidationError(() => validateEntityId(""));
			expectValidationError(() => validateEntityId(null as unknown as string));
			expectValidationError(() =>
				validateEntityId(undefined as unknown as string),
			);
		});

		it("should throw error for single part entity ID", () => {
			const entityId = "gmail";

			expectValidationError(() => validateEntityId(entityId));
		});

		it("should throw error for invalid service", () => {
			const entityId = "invalid.service-id";

			expectValidationError(() => validateEntityId(entityId));
		});

		it("should throw error for invalid characters", () => {
			const entityId = "gmail/message@id";

			expectValidationError(() => validateEntityId(entityId));
		});
	});
});

describe("validateTimeout", () => {
	describe("valid timeouts", () => {
		it("should accept positive timeout values", () => {
			expect(() => validateTimeout(1000)).not.toThrow();
			expect(() => validateTimeout(10000)).not.toThrow();
			expect(() => validateTimeout(5000)).not.toThrow();
		});

		it("should accept minimum timeout of 1ms", () => {
			expect(() => validateTimeout(1)).not.toThrow();
		});
	});

	describe("invalid timeouts", () => {
		it("should throw error for zero timeout", () => {
			expectValidationError(() => validateTimeout(0));
			expectValidationError(() => validateTimeout(-1));
		});

		it("should throw error for negative timeout", () => {
			expectValidationError(() => validateTimeout(-100));
		});

		it("should throw error for non-number timeout", () => {
			expectValidationError(() => validateTimeout("1000" as unknown as number));
			expectValidationError(() => validateTimeout(null as unknown as number));
			expectValidationError(() =>
				validateTimeout(undefined as unknown as number),
			);
		});

		it("should throw error for timeout exceeding 60,000ms", () => {
			expectValidationError(() => validateTimeout(60001));
			expectValidationError(() => validateTimeout(100000));
		});
	});
});

describe("validateRetries", () => {
	describe("valid retry counts", () => {
		it("should accept zero retries", () => {
			expect(() => validateRetries(0)).not.toThrow();
		});

		it("should accept positive retry counts", () => {
			expect(() => validateRetries(1)).not.toThrow();
			expect(() => validateRetries(3)).not.toThrow();
			expect(() => validateRetries(5)).not.toThrow();
		});
	});

	describe("invalid retry counts", () => {
		it("should throw error for negative retry count", () => {
			expectValidationError(() => validateRetries(-1));
			expectValidationError(() => validateRetries(-5));
		});

		it("should throw error for non-number retry count", () => {
			expectValidationError(() => validateRetries("3" as unknown as number));
			expectValidationError(() => validateRetries(null as unknown as number));
			expectValidationError(() =>
				validateRetries(undefined as unknown as number),
			);
		});

		it("should throw error for retry count exceeding 10", () => {
			expectValidationError(() => validateRetries(11));
			expectValidationError(() => validateRetries(20));
		});
	});
});
