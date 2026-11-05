/**
 * Hand-rolled Google Calendar v3 REST client.
 *
 * Deliberately uses `fetch` directly (no `@googleapis/calendar` dependency)
 * to keep the bundle light and to allow injection of a fake fetch in tests.
 *
 * This module is pure TypeScript + `fetch` — it MUST NOT import
 * `@vicinae/api` or any other Vicinae runtime module so it stays
 * unit-testable outside the Vicinae host.
 *
 * NOTE (MVP limitation): event listing uses `singleEvents=true` +
 * `orderBy=startTime` expansion. Unlike the Raycast extension, we do not
 * merge a `singleEvents=false` recurring-master query with
 * `events.instances`; recurring instances are expanded server-side.
 */

import { invalidateAccessToken as invalidateStoredAccessToken } from "../auth/google-oauth";

export interface GoogleApiErrorOptions {
  status: number;
  message: string;
  reason?: string;
}

export class GoogleApiError extends Error {
  status: number;
  reason?: string;
  body?: unknown;

  constructor(options: GoogleApiErrorOptions & { body?: unknown }) {
    super(options.message);
    this.name = "GoogleApiError";
    this.status = options.status;
    this.reason = options.reason;
    if (options.body !== undefined) {
      this.body = options.body;
    }
  }
}

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponseLike>;

export interface EventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface EventPerson {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
  organizer?: boolean;
  resource?: boolean;
}

export interface ConferenceEntryPoint {
  entryPointType?: string;
  uri?: string;
  label?: string;
}

export interface ConferenceData {
  entryPoints?: ConferenceEntryPoint[];
  conferenceSolution?: { name?: string; key?: { type?: string } };
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: ConferenceData;
  start?: EventDateTime;
  end?: EventDateTime;
  attendees?: EventPerson[];
  organizer?: EventPerson;
  creator?: EventPerson;
  colorId?: string;
  recurringEventId?: string;
  recurrence?: string[];
  iCalUID?: string;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
}

export interface CalendarListEntry {
  id: string;
  summary?: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
  timeZone?: string;
  summaryOverride?: string;
}

export interface EventInput {
  summary: string;
  start: EventDateTime;
  end: EventDateTime;
  description?: string;
  location?: string;
  attendees?: Array<{ email: string }>;
  colorId?: string;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method: "email" | "popup"; minutes: number }>;
  };
  conferenceData?: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey: { type: "hangoutsMeet" };
    };
  };
}

export type SendUpdates = "all" | "externalOnly" | "none";

export interface ListEventsParams {
  timeMin: string;
  timeMax: string;
  maxResults?: number;
  query?: string;
  pageToken?: string;
  showDeleted?: boolean;
}

export interface ListEventsResult {
  items: GoogleEvent[];
  nextPageToken?: string;
}

export interface GoogleCalendarClient {
  listCalendars(options?: { showHidden?: boolean }): Promise<CalendarListEntry[]>;
  listEvents(
    calendarId: string,
    params: ListEventsParams,
    signal?: AbortSignal,
  ): Promise<ListEventsResult>;
  listAllEvents(
    calendarId: string,
    params: ListEventsParams,
    options?: { maxPages?: number; signal?: AbortSignal },
  ): Promise<GoogleEvent[]>;
  quickAddEvent(
    calendarId: string,
    text: string,
    options?: { sendUpdates?: SendUpdates; signal?: AbortSignal },
  ): Promise<GoogleEvent>;
  createEvent(
    calendarId: string,
    input: EventInput,
    options?: {
      sendUpdates?: SendUpdates;
      conferenceDataVersion?: number;
      signal?: AbortSignal;
    },
  ): Promise<GoogleEvent>;
  getEvent(calendarId: string, eventId: string, signal?: AbortSignal): Promise<GoogleEvent>;
}

export interface CalendarClientConfig {
  getAccessToken: () => Promise<string>;
  /**
   * Forced-expiry hook called once before a single 401 retry. Defaults to
   * the real auth module's invalidateAccessToken; inject a stub in tests.
   */
  invalidateAccessToken?: () => Promise<void>;
  fetchImpl?: FetchLike;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://www.googleapis.com/calendar/v3";

function buildUrl(base: string, path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

interface ErrorBodyShape {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

function extractGoogleError(parsed: unknown): { message?: string; reason?: string } {
  if (typeof parsed !== "object" || parsed === null) return {};
  const body = parsed as ErrorBodyShape;
  const err = body.error;
  if (typeof err !== "object" || err === null) return {};
  const message = typeof err.message === "string" ? err.message : undefined;
  const first = Array.isArray(err.errors) ? err.errors[0] : undefined;
  const reason =
    first && typeof first.reason === "string"
      ? first.reason
      : undefined;
  return { message, reason };
}

export function createCalendarClient(config: CalendarClientConfig): GoogleCalendarClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl: FetchLike =
    config.fetchImpl ??
    ((globalThis.fetch as unknown as FetchLike | undefined) !== undefined
      ? (globalThis.fetch as unknown as FetchLike)
      : (() => {
          throw new Error("No fetch implementation available");
        }) as FetchLike);

  const invalidateForRetry: () => Promise<void> =
    config.invalidateAccessToken ??
    (async () => {
      try {
        await invalidateStoredAccessToken();
      } catch {
        // Host token store unreachable (e.g. unit tests with a stubbed
        // getAccessToken) — the retry below still re-reads the token.
      }
    });

  async function throwGoogleApiError(response: HttpResponseLike): Promise<never> {
    // Non-2xx: parse Google's error envelope when possible.
    let parsedBody: unknown;
    let rawText = "";
    try {
      parsedBody = await response.json();
    } catch {
      try {
        rawText = await response.text();
      } catch {
        rawText = "";
      }
    }

    const { message: googleMessage, reason } =
      parsedBody !== undefined ? extractGoogleError(parsedBody) : {};
    const fallbackMessage =
      rawText || `Request failed with status ${response.status}`;
    const message = googleMessage
      ? `Google API error ${response.status}: ${googleMessage}`
      : `Google API error ${response.status}: ${fallbackMessage}`;

    throw new GoogleApiError({
      status: response.status,
      message,
      reason,
      body: parsedBody,
    });
  }

  async function authorizedFetch(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
    signal?: AbortSignal,
    retried = false,
  ): Promise<any> {
    const token = await config.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    };
    // `FetchLike` does not declare `signal`, but the underlying fetch
    // supports it — forward through with a cast.
    const requestInit = { ...init, headers, ...(signal ? { signal } : {}) } as {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    const response = await fetchImpl(url, requestInit);

    if (response.ok) {
      if (response.status === 204) return undefined;
      return await response.json();
    }

    if (response.status === 401 && !retried) {
      // Access token rejected: force a refresh through getAccessToken() and
      // retry exactly once. `retried` guarantees this cannot loop.
      await invalidateForRetry();
      return authorizedFetch(url, init, signal, true);
    }

    return throwGoogleApiError(response);
  }

  const client: GoogleCalendarClient = {
    async listCalendars(options?: { showHidden?: boolean }): Promise<CalendarListEntry[]> {
      const showHidden = options?.showHidden ?? false;
      const items: CalendarListEntry[] = [];
      let pageToken: string | undefined;
      do {
        const url = buildUrl(`${baseUrl}/users/me/calendarList`, "", {
          maxResults: "250",
          showHidden: String(showHidden),
          pageToken,
        });
        const data = await authorizedFetch(url, { method: "GET" });
        if (Array.isArray(data?.items)) {
          items.push(...data.items);
        }
        pageToken = typeof data?.nextPageToken === "string" ? data.nextPageToken : undefined;
      } while (pageToken);
      return items;
    },

    async listEvents(
      calendarId: string,
      params: ListEventsParams,
      signal?: AbortSignal,
    ): Promise<ListEventsResult> {
      const id = calendarId || "primary";
      const url = buildUrl(`${baseUrl}/calendars/${encodeURIComponent(id)}/events`, "", {
        timeMin: params.timeMin,
        timeMax: params.timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: String(params.maxResults ?? 250),
        pageToken: params.pageToken,
        q: params.query,
        showDeleted: String(params.showDeleted ?? false),
      });
      const data = await authorizedFetch(url, { method: "GET" }, signal);
      return {
        items: Array.isArray(data?.items) ? data.items : [],
        nextPageToken:
          typeof data?.nextPageToken === "string" ? data.nextPageToken : undefined,
      };
    },

    async listAllEvents(
      calendarId: string,
      params: ListEventsParams,
      options?: { maxPages?: number; signal?: AbortSignal },
    ): Promise<GoogleEvent[]> {
      const maxPages = options?.maxPages ?? 10;
      const all: GoogleEvent[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < maxPages; page++) {
        const result = await client.listEvents(
          calendarId,
          { ...params, pageToken },
          options?.signal,
        );
        all.push(...result.items);
        // A page without a token is the last one — stop early.
        if (!result.nextPageToken) break;
        pageToken = result.nextPageToken;
      }
      return all;
    },

    async quickAddEvent(
      calendarId: string,
      text: string,
      options?: { sendUpdates?: SendUpdates; signal?: AbortSignal },
    ): Promise<GoogleEvent> {
      const id = calendarId || "primary";
      const url = buildUrl(`${baseUrl}/calendars/${encodeURIComponent(id)}/events/quickAdd`, "", {
        text,
        sendUpdates: options?.sendUpdates,
      });
      return (await authorizedFetch(
        url,
        { method: "POST", headers: { "Content-Type": "application/json" } },
        options?.signal,
      )) as GoogleEvent;
    },

    async createEvent(
      calendarId: string,
      input: EventInput,
      options?: {
        sendUpdates?: SendUpdates;
        conferenceDataVersion?: number;
        signal?: AbortSignal;
      },
    ): Promise<GoogleEvent> {
      const id = calendarId || "primary";
      const url = buildUrl(`${baseUrl}/calendars/${encodeURIComponent(id)}/events`, "", {
        sendUpdates: options?.sendUpdates,
        conferenceDataVersion:
          options?.conferenceDataVersion !== undefined
            ? String(options.conferenceDataVersion)
            : undefined,
      });
      return (await authorizedFetch(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        options?.signal,
      )) as GoogleEvent;
    },

    async getEvent(
      calendarId: string,
      eventId: string,
      signal?: AbortSignal,
    ): Promise<GoogleEvent> {
      const id = calendarId || "primary";
      const url = `${baseUrl}/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`;
      return (await authorizedFetch(url, { method: "GET" }, signal)) as GoogleEvent;
    },
  };

  return client;
}
