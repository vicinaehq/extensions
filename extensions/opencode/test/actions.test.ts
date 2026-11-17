import { describe, expect, test } from "bun:test";
import { buildReviewPrompt } from "../src/lib/prompts";
import { jsonResponse, makeService, sessionFixture } from "./helpers";

describe("flows", () => {
  test("quick ask creates a session in the project and sends the prompt", async () => {
    const { service, requests } = makeService(({ url, method }) => {
      if (url.endsWith("/api/session") && method === "POST") {
        return jsonResponse({ data: sessionFixture({ id: "ses_quick", title: "Quick" }) });
      }
      if (url.includes("/prompt") && method === "POST") {
        return jsonResponse({ data: { id: "msg_1", text: "hi", type: "user", time: { created: 1 } } });
      }
      return jsonResponse({}, 404);
    });
    const session = await service.createSession({ directory: "/tmp/project" });
    await service.sendPrompt(session.id, "Explain this error and suggest a fix.");

    const createRequest = requests.find((request) => request.method === "POST" && request.url.endsWith("/api/session"));
    const promptRequest = requests.find((request) => request.url.includes("/prompt"));
    const createBody = JSON.parse(createRequest?.body ?? "{}") as { location?: { directory?: string } };
    expect(createBody.location?.directory).toBe("/tmp/project");
    const promptBody = JSON.parse(promptRequest?.body ?? "{}") as { text?: string };
    expect(promptBody.text).toBe("Explain this error and suggest a fix.");
  });

  test("resume prerequisite: a session can be fetched before opening", async () => {
    const { service } = makeService(({ url }) =>
      url.includes("/api/session/ses_test123")
        ? jsonResponse({ data: sessionFixture() })
        : jsonResponse({}, 404),
    );
    const session = await service.session("ses_test123");
    expect(session.id).toBe("ses_test123");
    expect(session.location?.directory).toBe("/tmp/project");
  });

  test("review changes sends a review prompt into the project", async () => {
    const { service, requests } = makeService(({ url, method }) => {
      if (url.endsWith("/api/session") && method === "POST") {
        return jsonResponse({ data: sessionFixture({ id: "ses_review" }) });
      }
      if (url.includes("/prompt") && method === "POST") {
        return jsonResponse({ data: { id: "msg_1", text: "", type: "user", time: { created: 1 } } });
      }
      if (url.includes("/api/vcs")) {
        return jsonResponse({
          location: { directory: "/tmp/project" },
          data: { provider: "git", branch: { current: "main", default: "main" } },
        });
      }
      return jsonResponse({}, 404);
    });

    const vcs = await service.vcs("/tmp/project");
    expect(vcs?.branch?.current).toBe("main");

    const session = await service.createSession({ directory: "/tmp/project" });
    await service.sendPrompt(session.id, buildReviewPrompt("working", vcs?.branch));

    const promptBody = JSON.parse(
      requests.find((request) => request.url.includes("/prompt"))?.body ?? "{}",
    ) as { text?: string };
    expect(promptBody.text).toContain("working tree changes");
    expect(promptBody.text).toContain("Do not modify files.");
  });

  test("a directory without version control resolves to null", async () => {
    const { service } = makeService(({ url }) =>
      url.includes("/api/vcs")
        ? jsonResponse({ location: { directory: "/tmp" }, data: { branch: {} } })
        : jsonResponse({}, 404),
    );
    const vcs = await service.vcs("/tmp");
    expect(vcs).toBeNull();
  });

  test("deleting a missing session surfaces a not-found error", async () => {
    const { service } = makeService(({ method }) =>
      method === "DELETE"
        ? jsonResponse({ _tag: "SessionNotFoundError", sessionID: "ses_gone", message: "Session not found: ses_gone" }, 404)
        : jsonResponse({}, 404),
    );
    try {
      await service.deleteSession("ses_gone");
      throw new Error("expected deleteSession to reject");
    } catch (error) {
      expect((error as Error).message).toBe("Session no longer exists.");
    }
  });
});
