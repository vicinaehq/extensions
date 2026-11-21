import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  readFile,
  writeFile,
  chmod,
  rm,
  access,
} from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  openCodeCatalog,
  openCodeResult,
  runOpenCode,
  textOnlyConfig,
  validateTextOnlyConfig,
} from "../src/harnesses/opencode";
import { DEFAULT_SYSTEM_PROMPT, type RunRequest } from "../src/core/types";

const catalog = {
  all: [
    {
      id: "connected",
      models: {
        "nested/new-model": {
          name: "Dynamic Model",
          variants: { low: {}, unusual: {}, disabled: { disabled: true } },
          capabilities: { output: { text: true } },
        },
        image: { capabilities: { output: { text: false } } },
      },
    },
    { id: "unconnected", models: { model: {} } },
  ],
  connected: ["connected"],
};
const goodResult = {
  info: { role: "assistant", finish: "stop", time: { completed: 1 } },
  parts: [
    { type: "reasoning", text: "private thinking" },
    { type: "text", text: "  Hello\n" },
  ],
};

test("OpenCode only lists connected text models and their current enabled variants", () => {
  const models = openCodeCatalog(catalog);
  assert.equal(models.length, 1);
  assert.equal(models[0]!.id, "connected/nested/new-model");
  assert.deepEqual(models[0]!.efforts, ["low", "unusual"]);
  assert.throws(
    () => openCodeCatalog({ all: [], connected: [] }),
    /No connected/,
  );
});

test("OpenCode accepts only complete text, never reasoning, truncation, tool requests or failures", () => {
  assert.equal(openCodeResult(goodResult), "  Hello\n");
  for (const change of [
    { finish: "length" },
    { finish: "tool-calls" },
    { time: {} },
    { role: "user" },
    { error: { name: "APIError", data: { message: "secret-key" } } },
  ]) {
    assert.throws(
      () =>
        openCodeResult({
          ...goodResult,
          info: { ...goodResult.info, ...change },
        }),
      (error: Error) => !error.message.includes("secret-key"),
    );
  }
  assert.throws(
    () =>
      openCodeResult({
        ...goodResult,
        parts: [...goodResult.parts, { type: "tool" }],
      }),
    /tool request/,
  );
});

test("OpenCode copies provider configuration but removes coding agents, plugins, instructions and MCP", () => {
  const config = textOnlyConfig({
    provider: { custom: { models: { dynamic: {} } } },
    enabled_providers: ["custom"],
    instructions: ["private.md"],
    plugin: ["external"],
    mcp: { shell: { command: ["bad"] } },
    agent: { "ai-commands": { steps: 1, prompt: "coding" } },
  });
  assert.deepEqual(config.provider, { custom: { models: { dynamic: {} } } });
  for (const key of ["instructions", "plugin", "mcp"])
    assert.equal(config[key], undefined);
  validateTextOnlyConfig(config);
  const agent = (config.agent as Record<string, unknown>)[
    "ai-commands"
  ] as Record<string, unknown>;
  assert.equal(agent.prompt, DEFAULT_SYSTEM_PROMPT);
  assert.equal(agent.steps, undefined);
  for (const override of [
    { instructions: ["inherited"] },
    { mcp: { external: { enabled: true } } },
    { share: "auto" },
    { snapshot: true },
    { agent: { "ai-commands": { ...agent, steps: 1 } } },
    { agent: { "ai-commands": { ...agent, permission: "allow" } } },
  ]) {
    assert.throws(
      () => validateTextOnlyConfig({ ...config, ...override }),
      /cannot be isolated/,
    );
  }
});

async function fixture<T>(
  hang: boolean,
  run: (executable: string, auditPath: string, directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "ai-opencode-test-"));
  const executable = join(directory, "opencode.mjs");
  const auditPath = join(directory, "audit.json");
  await writeFile(
    executable,
    `#!${process.execPath}\n` +
      `
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const argv = process.argv.slice(2);
assert.ok(argv.includes('--pure'));
if (argv.includes('debug')) {
  console.log(JSON.stringify({ provider: { fixture: { models: {} } }, instructions: ['must-not-inherit'], mcp: { unwanted: {} } }));
} else {
  const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT);
  assert.equal(config.instructions, undefined);
  assert.equal(config.mcp, undefined);
  assert.ok(process.env.XDG_CONFIG_HOME.startsWith(process.cwd()));
  assert.ok(process.env.OPENCODE_DB.startsWith(process.cwd()));
  const audit = { pid: process.pid, cwd: process.cwd(), requests: [] };
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('opencode:' + process.env.OPENCODE_SERVER_PASSWORD).toString('base64'));
    let text = ''; for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    audit.requests.push({ path: req.url, body });
    writeFileSync(${JSON.stringify(auditPath)}, JSON.stringify(audit));
    res.setHeader('content-type', 'application/json');
    if (req.url === '/global/health') res.end(JSON.stringify({ healthy: true, version: '1.18.29' }));
    else if (req.url === '/config') res.end(JSON.stringify(config));
    else if (req.url === '/provider') res.end(JSON.stringify(${JSON.stringify(catalog)}));
    else if (req.url === '/session') res.end(JSON.stringify({ id: 'ses_fixture' }));
    else if (req.url === '/session/ses_fixture/message' && !${hang}) res.end(JSON.stringify(${JSON.stringify(goodResult)}));
  });
  server.listen(0, '127.0.0.1', () => console.log('opencode server listening on http://127.0.0.1:' + server.address().port));
}
`,
  );
  await chmod(executable, 0o700);
  try {
    return await run(executable, auditPath, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function input(
  executable: string,
  signal = new AbortController().signal,
): RunRequest {
  return {
    executable,
    signal,
    onText: () => {},
    prompt: "Привет\n$(never-a-shell)",
    command: {
      schemaVersion: 1,
      id: "fixture",
      name: "Fixture",
      prompt: "{selection}",
      systemPrompt: "Plain text",
      harness: "opencode",
      model: "connected/nested/new-model",
      effort: "unusual",
      createdAt: "",
      updatedAt: "",
    },
  };
}
test("OpenCode HTTP integration sends the selected model, variant, system and denied permissions, then cleans up", async () => {
  await fixture(false, async (executable, auditPath) => {
    assert.equal(await runOpenCode(input(executable)), "  Hello\n");
    const audit = JSON.parse(await readFile(auditPath, "utf8"));
    const requests = audit.requests as {
      path: string;
      body?: Record<string, unknown>;
    }[];
    assert.deepEqual(
      requests.map((request) => request.path),
      [
        "/global/health",
        "/config",
        "/provider",
        "/session",
        "/session/ses_fixture/message",
      ],
    );
    assert.deepEqual(requests[3]!.body!.permission, [
      { permission: "*", pattern: "*", action: "deny" },
    ]);
    assert.deepEqual(requests[4]!.body, {
      model: { providerID: "connected", modelID: "nested/new-model" },
      agent: "ai-commands",
      system: "Plain text",
      variant: "unusual",
      parts: [{ type: "text", text: "Привет\n$(never-a-shell)" }],
    });
    await assert.rejects(access(audit.cwd));
    assert.throws(() => process.kill(audit.pid, 0));
  });
});
test("OpenCode cancellation kills an active generation server and removes its temporary session DB", async () => {
  await fixture(true, async (executable, auditPath, directory) => {
    const controller = new AbortController();
    const watcher = watch(directory, () => {
      void readFile(auditPath, "utf8")
        .then((text) => {
          if (
            JSON.parse(text).requests.some((request: { path: string }) =>
              request.path.endsWith("/message"),
            )
          )
            controller.abort();
        })
        .catch(() => {});
    });
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await assert.rejects(runOpenCode(input(executable, controller.signal)));
      const audit = JSON.parse(await readFile(auditPath, "utf8"));
      assert.ok(
        audit.requests.some((request: { path: string }) =>
          request.path.endsWith("/message"),
        ),
      );
      await assert.rejects(access(audit.cwd));
      assert.throws(() => process.kill(audit.pid, 0));
    } finally {
      clearTimeout(timeout);
      watcher.close();
    }
  });
});
