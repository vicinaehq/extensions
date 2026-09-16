import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { test } from "node:test";
import { apiModels, runApi } from "../src/harnesses/api";
import { readEvents } from "../src/harnesses/http";
import { type ApiId, type RunRequest } from "../src/core/types";

const key = "sk-test-only-do-not-send";
function request(
  harness: ApiId,
  overrides: Partial<RunRequest> = {},
): RunRequest {
  return {
    executable: "",
    apiKey: key,
    prompt: "Translate: Привет $()",
    signal: new AbortController().signal,
    onText: () => {},
    command: {
      schemaVersion: 1,
      id: "test",
      name: "Test",
      harness,
      model: "new-model-from-server",
      effort: "",
      prompt: "{selection}",
      systemPrompt: "Only plain text",
      createdAt: "",
      updatedAt: "",
    },
    ...overrides,
  };
}
const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
const completed = (text = "  Hello\n") => ({
  type: "response.completed",
  response: {
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text }],
      },
    ],
  },
});
async function body(req: IncomingMessage) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : undefined;
}
async function server<T>(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void,
  fn: (fetcher: typeof fetch) => Promise<T>,
): Promise<T> {
  const http = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error) => {
      res.destroy(error);
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as { port: number }).port;
  try {
    return await fn((input, init) => {
      const url = new URL(String(input));
      return fetch(
        `http://127.0.0.1:${port}${url.pathname}${url.search}`,
        init,
      );
    });
  } finally {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
}

test("SSE parses split UTF-8, CRLF, comments and multiline data", async () => {
  const data = Buffer.from(
    ': keepalive\r\n\r\nevent: delta\r\ndata: {"type":"delta",\r\ndata: "text":"Привет"}\r\n\r\n',
  );
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of data) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events = [];
  for await (const value of readEvents(
    new Response(stream, { headers: { "content-type": "text/event-stream" } }),
  ))
    events.push(value);
  assert.deepEqual(events, [{ type: "delta", text: "Привет" }]);
});

for (const harness of ["openai-api", "xai-api"] as const) {
  test(`${harness} gets dynamic models and sends text-only Responses requests with the explicit key`, async () => {
    let sent = false;
    await server(
      async (req, res) => {
        assert.equal(req.headers.authorization, `Bearer ${key}`);
        assert.equal(req.headers["x-api-key"], undefined);
        if (
          req.url ===
          (harness === "xai-api" ? "/v1/language-models" : "/v1/models")
        ) {
          res.end(
            JSON.stringify(
              harness === "xai-api"
                ? {
                    models: [
                      {
                        id: "new-model-from-server",
                        output_modalities: ["text"],
                      },
                      { id: "non-text-product", output_modalities: ["image"] },
                    ],
                  }
                : {
                    data: [
                      { id: "new-model-from-server" },
                      { id: "embedding-product" },
                    ],
                  },
            ),
          );
          return;
        }
        assert.equal(req.url, "/v1/responses");
        const payload = await body(req);
        assert.deepEqual(payload, {
          model: "new-model-from-server",
          input: [{ role: "user", content: "Translate: Привет $()" }],
          stream: true,
          store: false,
          instructions: "Only plain text",
          reasoning: { effort: "high" },
        });
        assert.ok(!JSON.stringify(payload).includes(key));
        sent = true;
        res.setHeader("content-type", "text/event-stream");
        res.end(
          event({ type: "response.output_text.delta", delta: "partial" }) +
            event(completed()),
        );
      },
      async (fetcher) => {
        const models = await apiModels(harness, key, undefined, fetcher);
        assert.deepEqual(
          models.map((model) => model.id),
          ["new-model-from-server"],
        );
        assert.match(models[0]!.effortInfo!, /does not report/);
        const input = request(harness);
        input.command.effort = "high";
        assert.equal(await runApi(input, fetcher), "  Hello\n");
      },
    );
    assert.equal(sent, true);
  });
}

test("missing API key fails before any network call", async () => {
  const fail = async () => {
    throw new Error("Unexpected network call");
  };
  await assert.rejects(
    apiModels("openai-api", "", undefined, fail),
    /Add your OpenAI API key/,
  );
  await assert.rejects(
    runApi(request("anthropic-api", { apiKey: undefined }), fail),
    /Add your Anthropic API key/,
  );
});

for (const status of [401, 403, 429, 500])
  test(`HTTP ${status} never exposes provider response secrets`, async () => {
    await server(
      (_req, res) => {
        res.statusCode = status;
        res.end(
          JSON.stringify({
            error: { message: `secret ${key}`, code: "rate_limit_exceeded" },
          }),
        );
      },
      async (fetcher) => {
        await assert.rejects(
          apiModels("openai-api", key, undefined, fetcher),
          (error: Error) =>
            error.message.includes(`HTTP ${status}`) &&
            !error.message.includes(key),
        );
      },
    );
  });

test("provider redirects are not followed with credentials", async () => {
  let calls = 0;
  await server(
    (_req, res) => {
      calls++;
      res.writeHead(302, { location: "/unexpected" });
      res.end();
    },
    async (fetcher) => {
      await assert.rejects(apiModels("xai-api", key, undefined, fetcher));
    },
  );
  assert.equal(calls, 1);
});

for (const tail of [
  "",
  event({ type: "response.incomplete" }),
  event({ type: "error", error: { message: key } }),
  event({ type: "response.refusal.delta", delta: "No" }),
  event({
    type: "response.completed",
    response: { status: "incomplete", output: [] },
  }),
]) {
  test(`Responses partial/error/refused output is never returned (${tail.slice(0, 60)})`, async () => {
    await server(
      (_req, res) => {
        res.setHeader("content-type", "text/event-stream");
        res.end(
          event({ type: "response.output_text.delta", delta: "partial" }) +
            tail,
        );
      },
      async (fetcher) => {
        await assert.rejects(
          runApi(request("openai-api"), fetcher),
          (error: Error) => !error.message.includes(key),
        );
      },
    );
  });
}

test("API cancellation aborts an active stream without returning its partial text", async () => {
  await server(
    (_req, res) => {
      res.setHeader("content-type", "text/event-stream");
      res.write(
        event({ type: "response.output_text.delta", delta: "partial" }),
      );
    },
    async (fetcher) => {
      const controller = new AbortController();
      await assert.rejects(
        runApi(
          request("xai-api", {
            signal: controller.signal,
            onText: () => controller.abort(),
          }),
          fetcher,
        ),
      );
    },
  );
});

const anthropicModel = {
  id: "new-model-from-server",
  display_name: "New Claude",
  max_tokens: 64000,
  capabilities: {
    thinking: { types: { adaptive: { supported: true } } },
    effort: {
      supported: true,
      low: { supported: true },
      ultra: { supported: true },
      high: { supported: false },
    },
  },
};
function anthropicEvents(stopReason = "end_turn") {
  return (
    event({
      type: "message_start",
      message: { role: "assistant", content: [] },
    }) +
    event({
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "" },
    }) +
    event({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "hidden reasoning" },
    }) +
    event({
      type: "content_block_start",
      index: 1,
      content_block: { type: "text", text: "" },
    }) +
    event({
      type: "content_block_delta",
      index: 1,
      delta: { type: "text_delta", text: "Hello" },
    }) +
    event({ type: "message_delta", delta: { stop_reason: stopReason } }) +
    event({ type: "message_stop" })
  );
}
test("Anthropic pagination and thinking capabilities drive discovery and request fields", async () => {
  await server(
    async (req, res) => {
      assert.equal(req.headers["x-api-key"], key);
      assert.equal(req.headers["anthropic-version"], "2023-06-01");
      assert.equal(req.headers.authorization, undefined);
      if (req.url?.startsWith("/v1/models")) {
        res.end(
          JSON.stringify(
            req.url.includes("after_id")
              ? { data: [{ id: "older-model" }], has_more: false }
              : {
                  data: [anthropicModel],
                  has_more: true,
                  last_id: "new-model-from-server",
                },
          ),
        );
        return;
      }
      assert.equal(req.url, "/v1/messages");
      const payload = await body(req);
      assert.deepEqual(payload.thinking, { type: "adaptive" });
      assert.deepEqual(payload.output_config, { effort: "ultra" });
      assert.equal(payload.max_tokens, 32768);
      assert.equal(payload.system, "Only plain text");
      assert.equal(payload.tools, undefined);
      assert.deepEqual(payload.messages, [
        { role: "user", content: "Translate: Привет $()" },
      ]);
      res.setHeader("content-type", "text/event-stream");
      res.end(anthropicEvents());
    },
    async (fetcher) => {
      const models = await apiModels("anthropic-api", key, undefined, fetcher);
      assert.deepEqual(
        models.map((model) => model.id),
        ["new-model-from-server", "older-model"],
      );
      assert.deepEqual(models[0]!.efforts, ["low", "ultra"]);
      const input = request("anthropic-api");
      input.command.effort = "ultra";
      assert.equal(await runApi(input, fetcher), "Hello");
    },
  );
});
for (const stopReason of ["max_tokens", "refusal", "tool_use", "pause_turn"])
  test(`Anthropic rejects ${stopReason} termination`, async () => {
    await server(
      (req, res) => {
        if (req.url?.startsWith("/v1/models")) {
          res.end(JSON.stringify({ data: [anthropicModel] }));
          return;
        }
        res.setHeader("content-type", "text/event-stream");
        res.end(anthropicEvents(stopReason));
      },
      async (fetcher) => {
        await assert.rejects(
          runApi(request("anthropic-api"), fetcher),
          /did not complete/,
        );
      },
    );
  });

test("Anthropic budget thinking is bounded and default omits thinking options", async () => {
  for (const effort of ["enabled", ""])
    await server(
      async (req, res) => {
        if (req.url?.startsWith("/v1/models")) {
          res.end(
            JSON.stringify({
              data: [
                {
                  id: "new-model-from-server",
                  max_tokens: 8192,
                  capabilities: {
                    thinking: { types: { enabled: { supported: true } } },
                  },
                },
              ],
            }),
          );
          return;
        }
        const payload = await body(req);
        assert.deepEqual(
          payload.thinking,
          effort ? { type: "enabled", budget_tokens: 4096 } : undefined,
        );
        assert.equal(payload.max_tokens, 8192);
        assert.equal(payload.output_config, undefined);
        res.setHeader("content-type", "text/event-stream");
        res.end(anthropicEvents());
      },
      async (fetcher) => {
        const input = request("anthropic-api");
        input.command.effort = effort;
        await runApi(input, fetcher);
      },
    );
});
