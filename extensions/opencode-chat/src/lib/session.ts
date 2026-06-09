import { getServerUrl } from "./opencode";

/**
 * Fetch the session title from OpenCode's local server.
 *
 * OpenCode auto-generates a title after the first user message using
 * a small/cheap model. The title is a short summary of the conversation,
 * typically under 50 characters.
 *
 * Returns undefined if the session doesn't exist, has no title yet,
 * or still has a placeholder title ("New session - ...").
 */
export async function fetchSessionTitle(
  sessionId: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(`${getServerUrl()}/session/${sessionId}`);
    if (!res.ok) return undefined;

    const data = (await res.json()) as { title?: string };
    const title = data.title;

    // Skip placeholder titles ("New session - 2026-03-29T...")
    if (!title || /^(New session|Child session) - \d{4}-/.test(title)) {
      return undefined;
    }

    return title;
  } catch {
    return undefined;
  }
}

// ── Provider / Model types from OpenCode's GET /provider ───────────

export interface OpenCodeModel {
  /** Model ID as sent to the API, e.g. "claude-sonnet-4-20250514" */
  id: string;
  /** Human-readable name, e.g. "Claude Sonnet 4" */
  name: string;
}

export interface OpenCodeProvider {
  /** Provider ID, e.g. "anthropic" */
  id: string;
  /** Human-readable name, e.g. "Anthropic" */
  name: string;
  /** Models keyed by model ID */
  models: Record<string, OpenCodeModel>;
}

export interface OpenCodeProviderList {
  providers: OpenCodeProvider[];
  /** Default model per provider: { "anthropic": "claude-sonnet-4-20250514" } */
  defaults: Record<string, string>;
}

/**
 * Fetch connected providers and their models from OpenCode.
 *
 * GET /provider returns all known providers (from models.dev database)
 * plus which ones are connected (have credentials). We filter to only
 * connected providers and return their models.
 */
export async function fetchProviders(): Promise<OpenCodeProviderList> {
  const empty = { providers: [], defaults: {} };
  try {
    // Ensure the OpenCode server is running before fetching
    const { ensureServer } = await import("./opencode");
    const url = await ensureServer();

    const res = await fetch(`${url}/provider`);
    if (!res.ok) return empty;

    const data = (await res.json()) as {
      all?: Array<{
        id: string;
        name: string;
        models?: Record<
          string,
          {
            id: string;
            name: string;
            status?: string;
          }
        >;
      }>;
      default?: Record<string, string>;
      connected?: string[];
    };

    const connectedSet = new Set(data.connected ?? []);
    const providers: OpenCodeProvider[] = [];

    for (const p of data.all ?? []) {
      if (!connectedSet.has(p.id)) continue;
      if (!p.models) continue;

      // Filter out deprecated models, keep active/beta/alpha
      const models: Record<string, OpenCodeModel> = {};
      for (const [id, m] of Object.entries(p.models)) {
        if (m.status === "deprecated") continue;
        models[id] = { id: m.id ?? id, name: m.name ?? id };
      }

      if (Object.keys(models).length === 0) continue;
      providers.push({ id: p.id, name: p.name, models });
    }

    return {
      providers,
      defaults: data.default ?? {},
    };
  } catch {
    return empty;
  }
}
