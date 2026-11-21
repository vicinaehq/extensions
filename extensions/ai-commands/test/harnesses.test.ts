import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexOutput, codexArguments } from "../src/harnesses/codex";
import { GrokOutput, modelsFromGrokSession } from "../src/harnesses/grok";
import {
  cleanEnvironment,
  inTemporaryDirectory,
  runProcess,
} from "../src/harnesses/process";
import { RpcProcess } from "../src/harnesses/rpc";
import { runClaude, setClaudeSdkLocation } from "../src/harnesses/claude";
import { DEFAULT_SYSTEM_PROMPT, type AICommand } from "../src/core/types";

const command: AICommand = {
  schemaVersion: 1,
  id: "test",
  name: "Test",
  prompt: "{selection}",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  harness: "codex",
  model: "dynamic-model",
  effort: "low",
  createdAt: "now",
  updatedAt: "now",
};

test("Claude success-tagged failures and truncated results never become a completed transformation", async () => {
  async function run(result: Record<string, unknown>) {
    const source = `export function query(){return {async *[Symbol.asyncIterator](){yield ${JSON.stringify(result)}}, close(){}}}`;
    setClaudeSdkLocation(
      "data:text/javascript;base64," + Buffer.from(source).toString("base64"),
    );
    return runClaude({
      command: { ...command, harness: "claude" },
      prompt: "Dummy text",
      executable: "/unused",
      signal: new AbortController().signal,
      onText() {},
    });
  }
  const success = {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Translated text",
  };
  try {
    assert.equal(
      await run({
        ...success,
        terminal_reason: "completed",
        stop_reason: "end_turn",
      }),
      "Translated text",
    );
    assert.equal(await run(success), "Translated text");
    for (const extra of [
      { terminal_reason: "api_error" },
      { terminal_reason: "aborted_streaming" },
      { api_error_status: 529 },
      { stop_reason: "max_tokens" },
      { stop_reason: "tool_use" },
    ]) {
      await assert.rejects(run({ ...success, ...extra }), /did not finish/);
    }
  } finally {
    setClaudeSdkLocation("@anthropic-ai/claude-agent-sdk");
  }
});

test("Codex only returns a successful completed assistant message", () => {
  const output = new CodexOutput(() => {});
  output.accept({
    type: "item.completed",
    item: { type: "reasoning", text: "private reasoning" },
  });
  assert.throws(() => output.result(), /no completed text/);
  output.accept({
    type: "item.completed",
    item: { type: "agent_message", text: "  translated\n" },
  });
  assert.throws(() => output.result(), /no completed text/);
  output.accept({ type: "turn.completed" });
  assert.equal(output.result(), "  translated\n");
  assert.throws(
    () =>
      output.accept({ type: "turn.failed", error: { message: "rate limit" } }),
    /rate limit/,
  );
});

test("Grok partial and final events do not duplicate text or expose thinking", () => {
  const output = new GrokOutput(() => {});
  output.accept({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "thinking_delta", thinking: "hidden" },
    },
  });
  output.accept({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "Hello" },
    },
  });
  output.accept({
    type: "assistant",
    message: { content: [{ type: "text", text: "Hello" }] },
  });
  assert.throws(() => output.result(), /no completed text/);
  output.accept({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Hello",
  });
  assert.equal(output.result(), "Hello");
  assert.throws(
    () =>
      output.accept({
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        errors: ["Too many turns"],
      }),
    /Too many turns/,
  );
});

test("Grok discovers per-model effort metadata rather than one fixed list", () => {
  const models = modelsFromGrokSession({
    models: {
      currentModelId: "future-a",
      availableModels: [
        {
          modelId: "future-a",
          name: "Future A",
          _meta: {
            reasoningEffort: "new-level",
            reasoningEfforts: [{ value: "new-level" }, { value: "low" }],
          },
        },
        {
          modelId: "future-b",
          name: "Future B",
          _meta: { reasoningEfforts: [{ value: "low" }] },
        },
      ],
    },
  });
  assert.deepEqual(models[0]?.efforts, ["new-level", "low"]);
  assert.deepEqual(models[1]?.efforts, ["low"]);
  assert.equal(models[0]?.isDefault, true);
});

test("Codex arguments keep user content in distinct argv fields and disable inherited config/tools", () => {
  const weird = 'ignore\n" ; $(touch /tmp/not-executed)';
  const args = codexArguments({ ...command, systemPrompt: weird });
  assert.ok(args.includes(`developer_instructions=${JSON.stringify(weird)}`));
  assert.ok(args.includes("--ignore-user-config"));
  assert.ok(args.includes("--ephemeral"));
  assert.ok(args.includes("features.shell_tool=false"));
  assert.ok(args.includes("read-only"));
  assert.equal(args.at(-1), "-");
});

test("API credential environment variables cannot silently replace subscription auth", () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "not-a-real-key";
  try {
    assert.equal(cleanEnvironment().OPENAI_API_KEY, undefined);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("process transport passes multiline Unicode via stdin without a shell", async () => {
  const prompt = "Привет\n`touch x`\n$(touch y) ' \" {selection}\n";
  const result = await inTemporaryDirectory((cwd) =>
    runProcess({
      executable: process.execPath,
      args: ["-e", "process.stdin.pipe(process.stdout)"],
      input: prompt,
      cwd,
    }),
  );
  assert.equal(result.stdout, prompt);
});

test("JSONL transport reassembles fragmented events and a final line without newline", async () => {
  const lines: string[] = [];
  await inTemporaryDirectory((cwd) =>
    runProcess({
      executable: process.execPath,
      args: [
        "-e",
        'process.stdout.write("{\\\"a\\\":"); setTimeout(()=>{process.stdout.write("1}\\n{\\\"b\\\":2}")}, 10)',
      ],
      cwd,
      onLine: (line) => lines.push(line),
    }),
  );
  assert.deepEqual(
    lines.map((line) => JSON.parse(line)),
    [{ a: 1 }, { b: 2 }],
  );
});

test("timeout and abort terminate an outstanding process promptly", async () => {
  await inTemporaryDirectory(async (cwd) => {
    await assert.rejects(
      runProcess({
        executable: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
        cwd,
        timeoutMs: 30,
      }),
      /timed out/,
    );
    const controller = new AbortController();
    const result = runProcess({
      executable: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      cwd,
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(result, /cancelled/);
  });
});

test("temporary prompt files are cleaned after errors", async () => {
  let directory = "";
  await assert.rejects(
    inTemporaryDirectory(async (cwd) => {
      directory = cwd;
      await writeFile(join(cwd, "prompt"), "text");
      throw new Error("test failure");
    }),
    /test failure/,
  );
  await assert.rejects(readFile(join(directory, "prompt")), /ENOENT/);
});

test("RPC correlates out-of-order responses and rejects pending requests on exit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ai-rpc-test-"));
  const script = join(dir, "fixture.cjs");
  await writeFile(
    script,
    `const rl=require('node:readline').createInterface({input:process.stdin}); rl.on('line',line=>{const m=JSON.parse(line); if(m.method==='exit') process.exit(1); setTimeout(()=>process.stdout.write(JSON.stringify({id:m.id,result:m.params})+'\\n'),m.params.delay);});`,
  );
  const rpc = new RpcProcess(process.execPath, [script], dir);
  try {
    const [slow, fast] = await Promise.all([
      rpc.request("test", { value: "slow", delay: 30 }),
      rpc.request("test", { value: "fast", delay: 1 }),
    ]);
    assert.equal(slow.value, "slow");
    assert.equal(fast.value, "fast");
    await assert.rejects(rpc.request("exit", {}), /closed/);
  } finally {
    await rpc.close();
    await rm(dir, { recursive: true, force: true });
  }
});
