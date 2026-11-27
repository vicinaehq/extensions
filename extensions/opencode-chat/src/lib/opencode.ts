import { createOpencode } from "ai-sdk-provider-opencode-sdk";
import { createOpencodeServer } from "@opencode-ai/sdk/v2";

let provider: ReturnType<typeof createOpencode> | null = null;
let serverPromise: Promise<string> | null = null;
let serverUrl = "http://127.0.0.1:4096";

export function getProvider() {
  if (!provider) {
    provider = createOpencode({
      autoStartServer: true,
      serverTimeout: 15_000,
    });
  }
  return provider;
}

export function getModel(modelId: string) {
  return getProvider()(modelId);
}

/**
 * Ensure the OpenCode server is running and return its base URL.
 *
 * First checks if the server is already reachable. If not, spawns
 * `opencode serve` via the SDK's `createOpencodeServer`.
 */
export async function ensureServer(): Promise<string> {
  if (serverPromise) return serverPromise;

  serverPromise = (async () => {
    // Check if already running
    try {
      const res = await fetch(`${serverUrl}/global/health`);
      if (res.ok) return serverUrl;
    } catch {
      // Not running — start it
    }

    try {
      const server = await createOpencodeServer({
        hostname: "127.0.0.1",
        port: 4096,
        timeout: 15_000,
      });
      serverUrl = server.url;
      return serverUrl;
    } catch {
      // Failed to start, return default URL and hope for the best
      return serverUrl;
    }
  })();

  return serverPromise;
}

export function getServerUrl() {
  return serverUrl;
}
