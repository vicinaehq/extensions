import { describe, expect, test } from "bun:test";
import { installVicinaeStubs } from "./setup";

installVicinaeStubs();

const { toTranscript, transcriptMarkdown, lastAssistantText } = await import(
  "../src/components/session-transcript"
);

describe("transcript parsing", () => {
  test("user messages carry text directly, assistant messages carry content parts", () => {
    // Shapes come straight from the V2 session context API: user messages
    // have `type: "user"` and a top level `text`; assistant messages have
    // `content` parts. Neither has a `role` field.
    const messages = [
      { id: "m1", type: "compaction", time: { created: 1 } },
      {
        id: "m2",
        type: "user",
        time: { created: 2 },
        text: "fix the login bug",
        files: [],
        agents: [],
      },
      {
        id: "m3",
        type: "assistant",
        time: { created: 3 },
        content: [
          { type: "reasoning", text: "thinking" },
          { type: "text", text: "I will fix it." },
          { type: "tool", name: "edit", state: {} },
          { type: "text", text: " Done." },
        ],
      },
      { id: "m4", type: "idle", time: { created: 4 } },
    ];
    const transcript = toTranscript(messages);
    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toEqual({
      id: "m2",
      role: "user",
      text: "fix the login bug",
      time: 2,
      tools: [],
    });
    expect(transcript[1]?.role).toBe("assistant");
    expect(transcript[1]?.text).toBe("I will fix it. Done.");
    expect(transcript[1]?.tools).toEqual(["edit"]);
  });

  test("markdown skips text-less turns and can flip to newest first", () => {
    const messages = [
      { id: "m1", role: "user" as const, text: "first question", time: 1, tools: [] },
      { id: "m2", role: "assistant" as const, text: "", time: 2, tools: ["read", "grep"] },
      { id: "m3", role: "user" as const, text: "and then?", time: 3, tools: [] },
      { id: "m4", role: "assistant" as const, text: "All done.", time: 4, tools: ["edit"] },
    ];
    const natural = transcriptMarkdown(messages);
    expect(natural).not.toContain("(tool call only)");
    expect(natural.indexOf("first question")).toBeLessThan(natural.indexOf("All done."));

    const newestFirst = transcriptMarkdown(messages, true);
    expect(newestFirst.indexOf("All done.")).toBeLessThan(newestFirst.indexOf("first question"));
    // The text-less turn stays out of the markdown entirely; its tools
    // surface only in the metadata pane.
    expect(newestFirst).not.toContain("read, grep");
    expect(newestFirst).toContain("**Tools used:** edit");
  });

  test("last assistant text is the newest turn that produced text", () => {
    const messages = [
      { id: "m1", role: "user" as const, text: "q", time: 1, tools: [] },
      { id: "m2", role: "assistant" as const, text: "answer", time: 2, tools: [] },
      { id: "m3", role: "assistant" as const, text: "", time: 3, tools: ["edit"] },
    ];
    expect(lastAssistantText(messages)).toBe("answer");
  });
});
