import { OpenCode, type OpenCodeClient } from "@opencode/client";
import { mapOpenCodeError } from "./errors";
import type { Endpoint } from "./discovery";
import type {
  ModelInfo,
  ModelRef,
  Project,
  ServerInfo,
  SessionActive,
  SessionInfo,
  SessionMessageInfo,
  V2Event,
  VcsInfo,
} from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const PROMPT_TIMEOUT_MS = 30_000;

/** One page of sessions, newest-first unless `cursor` says otherwise. */
export interface SessionPage {
  readonly data: SessionInfo[];
  readonly next?: string | null;
}

export interface SessionListQuery {
  readonly limit?: number;
  readonly search?: string;
  readonly cursor?: string;
  readonly projectID?: string;
}

export interface CreateSessionInput {
  readonly title?: string;
  readonly directory?: string;
  readonly agent?: string;
  readonly model?: ModelRef;
}

/**
 * The only surface the UI is allowed to talk to. Backed by the official
 * OpenCode V2 client; the UI never sees raw HTTP details.
 */
export interface OpenCodeService {
  info(): Promise<ServerInfo>;
  projects(): Promise<Project[]>;
  sessions(query?: SessionListQuery): Promise<SessionPage>;
  /** All sessions, every page: triage must not miss failures beyond page one. */
  allSessions(query?: SessionListQuery): Promise<SessionPage>;
  session(id: string): Promise<SessionInfo>;
  activeSessions(): Promise<Record<string, SessionActive>>;
  createSession(input: CreateSessionInput): Promise<SessionInfo>;
  sendPrompt(sessionID: string, text: string): Promise<void>;
  renameSession(id: string, title: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  wait(sessionID: string, signal?: AbortSignal): Promise<void>;
  interrupt(sessionID: string): Promise<void>;
  models(): Promise<ModelInfo[]>;
  defaultModel(): Promise<ModelInfo | null>;
  switchModel(sessionID: string, model: ModelRef): Promise<void>;
  vcs(directory: string): Promise<VcsInfo | null>;
  messages(sessionID: string): Promise<SessionMessageInfo[]>;
  pendingPermissions(): Promise<Set<string>>;
  pendingForms(): Promise<Set<string>>;
  events(signal?: AbortSignal): AsyncIterable<V2Event>;
}

interface CallOptions {
  readonly timeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

type CallFn<T> = (client: OpenCodeClient, requestOptions?: { signal?: AbortSignal }) => Promise<T>;

function composeSignals(timeoutMs: number | undefined, signal?: AbortSignal | undefined): AbortSignal | undefined {
  const timeout = timeoutMs != null ? AbortSignal.timeout(timeoutMs) : undefined;
  if (timeout && signal) return AbortSignal.any([signal, timeout]);
  return timeout ?? signal;
}

/**
 * Run one call against the OpenCode API.
 *
 * A client is created per call with a fetch wrapper that observes the response
 * status, so API failures (401, 404, ...) map to precise error kinds even when
 * the error body is not JSON. No shared mutable state, no retries.
 */
async function call<T>(
  endpoint: Endpoint,
  fn: CallFn<T>,
  options?: CallOptions,
  fetchImpl?: typeof globalThis.fetch,
): Promise<T> {
  let failedStatus: number | undefined;
  const baseFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const client = OpenCode.make({
    baseUrl: endpoint.url,
    ...(endpoint.headers ? { headers: endpoint.headers } : {}),
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await baseFetch(input, init);
        if (!response.ok) failedStatus = response.status;
        return response;
      },
      { preconnect: () => {} },
    ),
  });
  const timeoutMs = options?.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
  const signal = composeSignals(timeoutMs, options?.signal);
  const requestOptions = signal ? { signal } : undefined;
  try {
    return await fn(client, requestOptions);
  } catch (error) {
    throw mapOpenCodeError(error, failedStatus);
  }
}

export function createOpenCodeService(
  endpoint: Endpoint,
  injected?: { readonly fetch?: typeof globalThis.fetch },
): OpenCodeService {
  const invoke = <T>(fn: CallFn<T>, options?: CallOptions): Promise<T> =>
    call(endpoint, fn, options, injected?.fetch);

  const sessions: OpenCodeService["sessions"] = (query) =>
    invoke(
      (client, options) =>
        client.session.list(
          {
            ...(query?.limit != null ? { limit: query.limit } : {}),
            ...(query?.search ? { search: query.search } : {}),
            ...(query?.cursor ? { cursor: query.cursor } : {}),
            ...(query?.projectID ? { project: query.projectID } : {}),
          },
          options,
        ),
      { timeoutMs: PROMPT_TIMEOUT_MS },
    ).then((page) => ({ data: page.data, next: page.cursor?.next ?? null }));

  return {
    info: () => invoke((client, options) => client.server.info(options)),

    projects: () => invoke((client, options) => client.project.list(options)),

    sessions,

    allSessions: async (query) => {
      const first = await sessions(query);
      if (!first.next) return first;
      const data = [...first.data];
      let cursor: string | null = first.next;
      while (cursor) {
        const page = await sessions({ ...query, cursor });
        data.push(...page.data.filter((session) => !data.some((existing) => existing.id === session.id)));
        cursor = page.next ?? null;
      }
      return { data, next: null };
    },

    session: (id) => invoke((client, options) => client.session.get({ sessionID: id }, options)),

    activeSessions: () => invoke((client, options) => client.session.active(options)),

    createSession: (input) =>
      invoke(
        (client, options) =>
          client.session.create(
            {
              ...(input.title ? { title: input.title } : {}),
              ...(input.directory ? { location: { directory: input.directory } } : {}),
              ...(input.agent ? { agent: input.agent } : {}),
              ...(input.model ? { model: input.model } : {}),
            },
            options,
          ),
        { timeoutMs: PROMPT_TIMEOUT_MS },
      ),

    sendPrompt: (sessionID, text) =>
      invoke((client, options) => client.session.prompt({ sessionID, text }, options), {
        timeoutMs: PROMPT_TIMEOUT_MS,
      }).then(() => undefined),

    renameSession: (id, title) =>
      invoke((client, options) => client.session.update({ sessionID: id, title }, options)),

    deleteSession: (id) => invoke((client, options) => client.session.remove({ sessionID: id }, options)),

    wait: (sessionID, signal) =>
      invoke((client, options) => client.session.wait({ sessionID }, options), {
        timeoutMs: undefined,
        signal,
      }),

    interrupt: (sessionID) =>
      invoke((client, options) => client.session.interrupt({ sessionID }, options)).then(() => undefined),

    models: () => invoke((client, options) => client.model.list(undefined, options)).then((out) => out.data),

    defaultModel: () =>
      invoke((client, options) => client.model.default(undefined, options)).then((out) => out.data),


    switchModel: (sessionID, model) =>
      invoke((client, options) => client.session.switchModel({ sessionID, model }, options)).then(() => undefined),

    vcs: (directory) =>
      invoke((client, options) => client.vcs.get({ location: { directory } }, options))
        .then((out) => (out.data.provider ? out.data : null))
        .catch((error) => {
          // A directory without version control is a normal state, not a failure.
          const mapped = mapOpenCodeError(error, undefined);
          if (mapped.kind === "not-found") return null;
          throw error;
        }),

    messages: (sessionID) => invoke((client, options) => client.session.context({ sessionID }, options)),

    pendingPermissions: async () => {
      const out = await invoke((client, options) => client.permission.request.list(undefined, options));
      return new Set(out.data.map((request) => request.sessionID));
    },

    pendingForms: async () => {
      const out = await invoke((client, options) => client.form.list(undefined, options));
      return new Set(out.data.map((form) => form.sessionID));
    },

    events: (signal) =>
      OpenCode.make({
        baseUrl: endpoint.url,
        ...(endpoint.headers ? { headers: endpoint.headers } : {}),
      }).event.subscribe({ ...(signal ? { signal } : {}) }),
  };
}
