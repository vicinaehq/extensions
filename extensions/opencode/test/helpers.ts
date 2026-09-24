import type { OpenCodeService } from "../src/lib/opencode/client";
import { createOpenCodeService } from "../src/lib/opencode/client";

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: string;
  readonly headers: Record<string, string>;
}

export type Responder = (request: RecordedRequest) => Response | Promise<Response>;

export function fakeFetch(responder: Responder): { readonly fetch: typeof fetch; readonly requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Honor an already-aborted signal the way the platform fetch does.
    const signal = init?.signal;
    if (signal?.aborted) {
      throw new DOMException("This operation was aborted", "AbortError");
    }
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    const headers: Record<string, string> = {};
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers[key] = value;
      });
    }
    requests.push({ url, method, ...(body !== undefined ? { body } : {}), headers });
    return responder({ url, method, ...(body !== undefined ? { body } : {}), headers });
  };
  const fetchMock = handler as unknown as typeof fetch;
  return { fetch: fetchMock, requests };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function textResponse(text: string, status: number): Response {
  return new Response(text, { status, headers: { "content-type": "text/plain" } });
}

export function makeService(
  responder: Responder,
): { readonly service: OpenCodeService; readonly requests: RecordedRequest[] } {
  const { fetch, requests } = fakeFetch(responder);
  return { service: createOpenCodeService({ url: "http://127.0.0.1:45999" }, { fetch }), requests };
}

export const NOW = 1_700_000_000_000;

/** A Session.Info shaped like the real V2 API response. */
export function sessionFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ses_test123",
    projectID: "proj_test",
    cost: 0.01,
    tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: NOW - 60_000, updated: NOW - 30_000 },
    location: { directory: "/tmp/project" },
    title: "Test session",
    agent: "build",
    model: { id: "gpt-4o", providerID: "openai" },
    ...overrides,
  };
}

export function serverInfoFixture(): Record<string, unknown> {
  return { version: "2.0.8", pid: 1234, urls: ["http://127.0.0.1:45999"], paths: { tmp: "/tmp" } };
}
