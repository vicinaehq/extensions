import assert from "node:assert/strict";
import { test } from "node:test";
import { antigravityLine, silentEndMessage } from "../src/providers/antigravity.ts";
import { claudeCodeLine } from "../src/providers/claude-code.ts";
import { codexNotification } from "../src/providers/codex.ts";
import { geminiChunk } from "../src/providers/gemini.ts";
import { openaiEvent } from "../src/providers/openai.ts";
import { sseEvents } from "../src/providers/sse.ts";
import { ProviderError, transcript } from "../src/providers/types.ts";

// Lines below were recorded from claude 2.1.302, agy 1.3.2 and codex-cli 0.162.1.

test("claude code: text deltas and results", () => {
	const delta =
		'{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello world"}},"session_id":"056f38f9","parent_tool_use_id":null}';
	assert.equal(claudeCodeLine(delta), "Hello world");
	assert.equal(claudeCodeLine('{"type":"system","subtype":"init"}'), undefined);
	assert.equal(claudeCodeLine('{"type":"result","subtype":"success","is_error":false,"result":"Hello world"}'), undefined);
	assert.throws(
		() => claudeCodeLine('{"type":"result","subtype":"success","is_error":true,"result":"Not logged in"}'),
		(err: unknown) => err instanceof ProviderError && /Not logged in/.test(err.message) && /claude auth login/.test(err.message),
	);
});

test("antigravity: agent response deltas and failed results", () => {
	const delta =
		'{"event":"step_update","step_update":{"conversation_id":"a2a5","step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"hi there"}}';
	assert.equal(antigravityLine(delta), "hi there");
	assert.equal(antigravityLine('{"event":"step_update","step_update":{"step_type":"user_input","state":"DONE"}}'), undefined);
	assert.equal(antigravityLine('{"event":"result","result":{"status":"SUCCESS","response":"hi there\\n"}}'), undefined);
	assert.throws(() => antigravityLine('{"event":"result","result":{"status":"ERROR"}}'), ProviderError);
});

test("antigravity: a silent end explains a refused tool", () => {
	// stderr recorded from agy 1.3.2 when a file read was refused in headless mode
	const refused =
		'jetski: no output produced — a tool required the "read_file" permission that headless mode cannot prompt for, so it was auto-denied.';
	assert.match(silentEndMessage(refused), /tried to use a tool/);
	assert.match(silentEndMessage(""), /finished without an answer/);
});

test("codex: deltas, completion, retries and failures", () => {
	assert.deepEqual(codexNotification({ method: "item/agentMessage/delta", params: { delta: "1 2" } }), { delta: "1 2" });
	assert.deepEqual(codexNotification({ method: "turn/completed", params: { turn: { status: "completed", error: null } } }), { done: true });
	assert.deepEqual(
		codexNotification({ method: "turn/completed", params: { turn: { status: "failed", error: { message: "usage limit" } } } }),
		{ error: "usage limit" },
	);
	assert.equal(codexNotification({ method: "error", params: { willRetry: true, error: { message: "x" } } }), undefined);
	assert.deepEqual(codexNotification({ method: "error", params: { willRetry: false, error: { message: "boom" } } }), { error: "boom" });
	assert.equal(codexNotification({ method: "mcpServer/startupStatus/updated", params: {} }), undefined);
});

test("openai: text deltas and errors", () => {
	assert.equal(openaiEvent('{"type":"response.output_text.delta","delta":"In","sequence_number":1}'), "In");
	assert.equal(openaiEvent('{"type":"response.completed","response":{}}'), undefined);
	assert.equal(openaiEvent("[DONE]"), undefined);
	assert.throws(() => openaiEvent('{"type":"error","error":{"message":"bad key"}}'), /bad key/);
});

test("gemini: joins text parts, skips thoughts, reports blocks", () => {
	const chunk = { candidates: [{ content: { role: "model", parts: [{ text: "plan", thought: true }, { text: "Hel" }, { text: "lo" }] } }] };
	assert.equal(geminiChunk(JSON.stringify(chunk)), "Hello");
	assert.equal(geminiChunk('{"candidates":[{"finishReason":"STOP"}]}'), undefined);
	assert.throws(() => geminiChunk('{"promptFeedback":{"blockReason":"SAFETY"}}'), /SAFETY/);
});

test("sse: events split across chunks, CRLF, multi-line data", async () => {
	const parts = ["event: a\r\ndata: {\"x\"", ":1}\r\n\r\ndata: one\ndata: two\n\n", "data: tail"];
	const body = new ReadableStream<Uint8Array>({
		start(c) {
			for (const p of parts) c.enqueue(new TextEncoder().encode(p));
			c.close();
		},
	});
	const events = [];
	for await (const e of sseEvents(body)) events.push(e);
	assert.deepEqual(events, [
		{ event: "a", data: '{"x":1}' },
		{ event: undefined, data: "one\ntwo" },
		{ event: undefined, data: "tail" },
	]);
});

test("transcript: one question passes through, follow-ups include history", () => {
	assert.equal(transcript([{ role: "user", content: "-v vs --verbose?" }]), "-v vs --verbose?");
	const folded = transcript([
		{ role: "user", content: "Capital of France?" },
		{ role: "assistant", content: "Paris." },
		{ role: "user", content: "Population?" },
	]);
	assert.match(folded, /User: Capital of France\?\n\nAssistant: Paris\.\n\nUser: Population\?/);
});
