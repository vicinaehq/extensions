import { describe, expect, test } from "bun:test";
import { createOpenCodeService } from "../src/lib/opencode/client";
import { mapOpenCodeError, isOpenCodeError } from "../src/lib/opencode/errors";
import {
  fakeFetch,
  jsonResponse,
  makeService,
  serverInfoFixture,
  sessionFixture,
  textResponse,
} from "./helpers";

describe("OpenCode client adapter", () => {
  test("health success returns server info", async () => {
    const { service, requests } = makeService(({ url }) =>
      url.endsWith("/api/info") ? jsonResponse(serverInfoFixture()) : jsonResponse({}, 404),
    );
    const info = await service.info();
    expect(info.version).toBe("2.0.8");
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.url).toContain("/api/info");
  });

  test("server unavailable maps to a reachable error", async () => {
    const { service } = makeService(() => {
      throw new TypeError("Unable to connect");
    });
    try {
      await service.info();
      throw new Error("expected info() to reject");
    } catch (error) {
      expect(isOpenCodeError(error)).toBe(true);
      expect((error as Error).message).toBe("OpenCode server is unreachable.");
    }
  });

  test("malformed response maps to a rejected request", async () => {
    const { service } = makeService(({ url }) =>
      url.endsWith("/api/info") ? textResponse("<html>not json</html>", 200) : jsonResponse({}, 404),
    );
    try {
      await service.info();
      throw new Error("expected info() to reject");
    } catch (error) {
      expect(isOpenCodeError(error)).toBe(true);
      expect((error as Error).message).toBe("OpenCode rejected the request.");
    }
  });

  test("authentication failure maps to an auth error", async () => {
    // The real server answers 401 with a non-JSON body.
    const { service } = makeService(({ url }) =>
      url.endsWith("/api/info") ? textResponse("unauthorized", 401) : jsonResponse({}, 404),
    );
    try {
      await service.info();
      throw new Error("expected info() to reject");
    } catch (error) {
      expect(isOpenCodeError(error)).toBe(true);
      expect((error as Error).message).toBe("Authentication failed.");
    }
  });

  test("missing session maps to a not-found error", async () => {
    const { service } = makeService(({ url, method }) =>
      url.includes("/api/session/ses_gone") && method === "GET"
        ? jsonResponse({ _tag: "SessionNotFoundError", sessionID: "ses_gone", message: "Session not found: ses_gone" }, 404)
        : jsonResponse({}, 404),
    );
    try {
      await service.session("ses_gone");
      throw new Error("expected session() to reject");
    } catch (error) {
      expect(isOpenCodeError(error)).toBe(true);
      expect((error as Error).message).toBe("Session no longer exists.");
    }
  });

  test("session listing returns data and pagination cursor", async () => {
    const { service, requests } = makeService(({ url }) => {
      if (url.includes("/api/session?")) {
        return jsonResponse({
          data: [sessionFixture(), sessionFixture({ id: "ses_test456", title: "Second" })],
          cursor: { previous: null, next: "cursor-token" },
        });
      }
      return jsonResponse({}, 404);
    });
    const page = await service.sessions({ limit: 2 });
    expect(page.data).toHaveLength(2);
    expect(page.next).toBe("cursor-token");
    expect(requests[0]?.url).toContain("limit=2");
  });

  test("server-side search is passed through", async () => {
    const { service, requests } = makeService(({ url }) =>
      url.includes("/api/session?")
        ? jsonResponse({ data: [sessionFixture()], cursor: { previous: null, next: null } })
        : jsonResponse({}, 404),
    );
    const page = await service.sessions({ search: "sheltermark", limit: 50 });
    expect(page.data).toHaveLength(1);
    expect(requests[0]?.url).toContain("search=sheltermark");
  });

  test("project filter is passed through", async () => {
    const { service, requests } = makeService(({ url }) =>
      url.includes("/api/session?")
        ? jsonResponse({ data: [], cursor: { previous: null, next: null } })
        : jsonResponse({}, 404),
    );
    await service.sessions({ projectID: "proj_abc" });
    expect(requests[0]?.url).toContain("project=proj_abc");
  });

  test("session creation sends the location and returns the session", async () => {
    const { service, requests } = makeService(({ url, method }) =>
      url.endsWith("/api/session") && method === "POST"
        ? jsonResponse({ data: sessionFixture({ id: "ses_new", title: "New" }) })
        : jsonResponse({}, 404),
    );
    const session = await service.createSession({ directory: "/tmp/project", title: "New" });
    expect(session.id).toBe("ses_new");
    const body = JSON.parse(requests[0]?.body ?? "{}") as { title?: string; location?: { directory?: string } };
    expect(body.title).toBe("New");
    expect(body.location?.directory).toBe("/tmp/project");
  });

  test("prompt submission sends the text", async () => {
    const { service, requests } = makeService(({ url, method }) =>
      url.includes("/prompt") && method === "POST"
        ? jsonResponse({ data: { id: "msg_1", text: "hi", type: "user", time: { created: 1 } } })
        : jsonResponse({}, 404),
    );
    await service.sendPrompt("ses_test123", "hello world");
    const body = JSON.parse(requests[0]?.body ?? "{}") as { text?: string; sessionID?: string };
    expect(body.text).toBe("hello world");
    expect(requests[0]?.url).toContain("/api/session/ses_test123/prompt");
  });

  test("rename sends the new title via patch", async () => {
    const { service, requests } = makeService(({ method }) =>
      method === "PATCH" ? new Response(null, { status: 204 }) : jsonResponse({}, 404),
    );
    await service.renameSession("ses_test123", "Renamed");
    const body = JSON.parse(requests[0]?.body ?? "{}") as { title?: string };
    expect(body.title).toBe("Renamed");
    expect(requests[0]?.method).toBe("PATCH");
  });

  test("delete issues a delete request", async () => {
    const { service, requests } = makeService(({ method }) =>
      method === "DELETE" ? new Response(null, { status: 204 }) : jsonResponse({}, 404),
    );
    await service.deleteSession("ses_test123");
    expect(requests[0]?.method).toBe("DELETE");
    expect(requests[0]?.url).toContain("/api/session/ses_test123");
  });

  test("auth headers from the endpoint are attached", async () => {
    const { fetch, requests } = fakeFetch(({ url }) =>
      url.endsWith("/api/info") ? jsonResponse(serverInfoFixture()) : jsonResponse({}, 404),
    );
    const service = createOpenCodeService(
      { url: "http://127.0.0.1:45999", headers: { authorization: "Basic dXNlcjpwYXNz" } },
      { fetch },
    );
    await service.info();
    expect(requests[0]?.headers["authorization"]).toBe("Basic dXNlcjpwYXNz");
  });

  test("timeout and abort errors map to a timeout error", () => {
    const timeout = mapOpenCodeError(new DOMException("aborted due to timeout", "TimeoutError"));
    expect(timeout.kind).toBe("timeout");
    const aborted = mapOpenCodeError(new DOMException("aborted", "AbortError"));
    expect(aborted.kind).toBe("timeout");
  });

  test("wait is abortable and does not hang without a timeout", async () => {
    const { service } = makeService(() => new Promise<Response>(() => {}));
    const controller = new AbortController();
    controller.abort();
    try {
      await service.wait("ses_test123", controller.signal);
      throw new Error("expected wait() to reject");
    } catch (error) {
      expect(isOpenCodeError(error)).toBe(true);
    }
  });

  test("pending permissions map every request to its session", async () => {
    const { service, requests } = makeService(({ url }) =>
      url.includes("/api/permission/request")
        ? jsonResponse({ data: [{ sessionID: "ses_a" }, { sessionID: "ses_b" }] })
        : jsonResponse({}, 404),
    );
    const waiting = await service.pendingPermissions();
    expect(requests[0]?.url).toContain("/api/permission/request");
    expect([...waiting].sort()).toEqual(["ses_a", "ses_b"]);
  });

  test("pending forms map every form to its session", async () => {
    const { service, requests } = makeService(({ url }) =>
      url.includes("/api/form")
        ? jsonResponse({ data: [{ sessionID: "ses_q", id: "frm_1" }] })
        : jsonResponse({}, 404),
    );
    const waiting = await service.pendingForms();
    expect(requests[0]?.url).toContain("/api/form");
    expect([...waiting]).toEqual(["ses_q"]);
  });

  test("error mapping normalizes unknown values", () => {
    const mapped = mapOpenCodeError(undefined);
    expect(isOpenCodeError(mapped)).toBe(true);
    expect(mapped.kind).toBe("rejected");
  });
});
