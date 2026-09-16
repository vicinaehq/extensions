import { execFile } from "child_process";
import { promisify } from "util";

import { parseAmpDisplay } from "./parser.ts";
import type { AmpError, AmpUsage } from "./types.ts";

const execFileAsync = promisify(execFile);
const AMP_API = "https://ampcode.com/api/internal?userDisplayBalanceInfo";
const CLI_TIMEOUT_MS = 12000;
const REQUEST_TIMEOUT = 15000;

function cleanToken(token: string | undefined): string | null {
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

export async function resolveAmpApiKey(preferenceKey?: string): Promise<string | null> {
  return cleanToken(preferenceKey) ?? cleanToken(process.env.AMP_API_KEY);
}

/**
 * Run `amp usage` against the locally installed CLI (tries amp, amp.cmd,
 * amp.exe for Windows shims). Returns the printed usage text, or null when the
 * CLI is absent/not signed in. Never throws.
 */
export async function readAmpCliUsage(): Promise<string | null> {
  for (const binary of ["amp", "amp.cmd", "amp.exe"]) {
    try {
      const { stdout } = await execFileAsync(binary, ["usage"], {
        encoding: "utf-8",
        timeout: CLI_TIMEOUT_MS,
        maxBuffer: 256 * 1024,
      });
      if (stdout.trim()) return stdout;
    } catch {
      // Binary missing or exited non-zero — try the next candidate.
    }
  }
  return null;
}

/**
 * POST the Amp internal endpoint with an access token. The payload may be JSON
 * wrapping the display text or the text itself — both are handled. Timeout
 * covers headers and body.
 */
async function fetchAmpDisplay(apiKey: string): Promise<{ text: string | null; error: AmpError | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(AMP_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json, text/plain" },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return {
        text: null,
        error: { type: "unauthorized", message: "Amp access token is invalid or expired. Create a new one in Amp settings." },
      };
    }
    if (!response.ok) {
      return { text: null, error: { type: "unknown", message: `Amp API error: HTTP ${response.status}` } };
    }
    const body = await response.text();
    try {
      const json: unknown = JSON.parse(body);
      if (json && typeof json === "object" && !Array.isArray(json)) {
        const record = json as Record<string, unknown>;
        for (const key of ["displayText", "text", "output", "usage", "result", "message"]) {
          const value = record[key];
          if (typeof value === "string" && value.trim()) return { text: value, error: null };
        }
      }
    } catch {
      // Not JSON — the body is the display text itself.
    }
    return { text: body.trim() ? body : null, error: null };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { text: null, error: { type: "network_error", message: "Request timeout. Please check your network connection." } };
    }
    return { text: null, error: { type: "network_error", message: err instanceof Error ? err.message : "Network request failed" } };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Amp Free + subscription pools + credits. CLI first, then access token. */
export async function fetchAmpUsage(apiKey: string | null): Promise<{ usage: AmpUsage | null; error: AmpError | null }> {
  if (apiKey) {
    const { text, error } = await fetchAmpDisplay(apiKey);
    if (error) return { usage: null, error };
    if (text) {
      const usage = parseAmpDisplay(text);
      if (usage) return { usage, error: null };
      return { usage: null, error: { type: "parse_error", message: "Failed to parse Amp usage data — the response format may have changed." } };
    }
  }

  const cliText = await readAmpCliUsage();
  if (cliText) {
    const usage = parseAmpDisplay(cliText);
    if (usage) return { usage, error: null };
    return { usage: null, error: { type: "parse_error", message: "Failed to parse `amp usage` output — the CLI format may have changed." } };
  }

  return {
    usage: null,
    error: {
      type: "not_configured",
      message: apiKey
        ? "Amp returned no usage text. Check the access token or sign in with the Amp CLI."
        : "Amp not configured. Install and sign in to the Amp CLI, or set AMP_API_KEY / the Amp access token in settings.",
    },
  };
}
