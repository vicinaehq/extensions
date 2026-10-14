import assert from "node:assert/strict";
import test from "node:test";
import { assistantError, takeJsonLines, toolSummary } from "./pi.ts";

test("Pi JSONL keeps partial and Unicode-separator data intact", () => {
  const first = takeJsonLines("", '{"type":"message_update","text":"a\u2028b"}\n{"type"');
  assert.equal(first.values[0].text, "a\u2028b");
  assert.equal(first.buffer, '{"type"');

  const second = takeJsonLines(first.buffer, ':"agent_settled"}\r\n');
  assert.deepEqual(second.values, [{ type: "agent_settled" }]);
  assert.equal(second.buffer, "");
});

test("tool summaries stay compact and omit output", () => {
  assert.equal(toolSummary("grep", { pattern: "TODO", path: "src" }), "grep · TODO · src");
  assert.equal(toolSummary("bash", { command: "npm test\necho noisy" }), "bash · npm test");
});

test("the final assistant result clears or exposes provider errors", () => {
  const failed = assistantError({
    type: "message_end",
    message: { role: "assistant", stopReason: "error", errorMessage: "Connection error." },
  });
  assert.equal(failed, "Connection error.");
  assert.equal(assistantError({ type: "agent_settled" }, failed), "Connection error.");
  assert.equal(assistantError({ type: "message_end", message: { role: "assistant", stopReason: "stop" } }, failed), "");
});
