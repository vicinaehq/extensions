import { Service } from "@opencode/client/service";
import { OpenCodeError } from "./errors";

/** Connection details for an OpenCode V2 server, ready to be used by the client. */
export interface Endpoint {
  readonly url: string;
  readonly headers?: Record<string, string>;
}

/** User-provided connection settings. Empty means local-only auto-discovery. */
export interface ConnectionConfig {
  readonly serverUrl?: string;
  readonly serverUsername?: string;
  readonly serverPassword?: string;
}

const HTTP_URL_PATTERN = /^https?:\/\//i;

/** Validate a configured server URL. Returns the normalized URL or null when invalid. */
export function parseServerUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !HTTP_URL_PATTERN.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (!url.hostname || url.username || url.password) return null;
    // Strip any path/query so the endpoint is a bare origin as the client expects.
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function basicAuthHeaders(username?: string, password?: string): Record<string, string> | undefined {
  if (!password) return undefined;
  const user = username?.trim() || "opencode";
  const credentials = Buffer.from(`${user}:${password}`).toString("base64");
  return { authorization: `Basic ${credentials}` };
}

/** Loopback hosts accept plaintext HTTP; anything else needs HTTPS for credentials. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  // A full four-octet address in the 127/8 range only. A prefix match would
  // let hostnames such as 127.attacker.example pass as loopback.
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * Resolve the OpenCode endpoint to talk to.
 *
 * 1. An explicitly configured server URL (validated, with optional basic auth).
 * 2. The local OpenCode service through the official client discovery.
 *
 * Returns null when no local service is running. Never scans ports and never
 * spawns servers. See {@link startOpenCodeService} for the supported start mechanism.
 */
export async function resolveEndpoint(
  config: ConnectionConfig,
  discovery?: { readonly file?: string },
): Promise<Endpoint | null> {
  if (config.serverUrl) {
    const url = parseServerUrl(config.serverUrl);
    if (!url) {
      throw new OpenCodeError(
        "rejected",
        "The configured OpenCode server URL is invalid.",
        `serverUrl: ${config.serverUrl}`,
      );
    }
    if (config.serverPassword) {
      const { protocol, hostname } = new URL(url);
      if (protocol === "http:" && !isLoopbackHost(hostname)) {
        throw new OpenCodeError(
          "rejected",
          "Password auth needs HTTPS on remote servers.",
          "Use an https:// URL or point at a local address.",
        );
      }
    }
    const headers = basicAuthHeaders(config.serverUsername, config.serverPassword);
    return { url, ...(headers ? { headers } : {}) };
  }

  const found = await Service.discover(discovery);
  if (!found) return null;
  const headers = Service.headers({ url: found.url, ...(found.auth ? { auth: found.auth } : {}) });
  return { url: found.url, ...(headers ? { headers: { ...headers } } : {}) };
}

/**
 * Start the local OpenCode service through the official client mechanism
 * (`@opencode/client/service` ensure), then wait for it to become healthy.
 */
export async function startOpenCodeService(binary: string): Promise<Endpoint> {
  const endpoint = await Service.ensure({ command: [binary, "serve", "--service"] });
  const headers = Service.headers(endpoint);
  return { url: endpoint.url, ...(headers ? { headers: { ...headers } } : {}) };
}
