import type { ConversationMessage } from "../src/components/conversation-detail";
import { describe, expect, test } from "bun:test";
import { installVicinaeStubs } from "./setup";

installVicinaeStubs();

const { conversationMarkdown } = await import("../src/components/conversation-detail");

function message(overrides: Partial<ConversationMessage> & { id: string }): ConversationMessage {
  return { role: "user", text: "hello", time: 1, ...overrides };
}

describe("conversation markdown", () => {
  test("renders in natural reading order: oldest at top, newest at bottom", () => {
    const markdown = conversationMarkdown(
      [
        message({ id: "1", role: "user", text: "first question" }),
        message({ id: "2", role: "assistant", text: "first answer" }),
        message({ id: "3", role: "user", text: "follow-up" }),
        message({ id: "4", role: "assistant", text: "second answer" }),
      ],
      false,
    );
    const firstQuestion = markdown.indexOf("first question");
    const firstAnswer = markdown.indexOf("first answer");
    const followUp = markdown.indexOf("follow-up");
    const secondAnswer = markdown.indexOf("second answer");
    expect(firstQuestion).toBeLessThan(firstAnswer);
    expect(firstAnswer).toBeLessThan(followUp);
    expect(followUp).toBeLessThan(secondAnswer);
  });

  test("marks authors and separates turns", () => {
    const markdown = conversationMarkdown(
      [
        message({ id: "1", role: "user", text: "q" }),
        message({ id: "2", role: "assistant", text: "a" }),
      ],
      false,
    );
    expect(markdown).toContain("**You**");
    expect(markdown).toContain("**Assistant**");
    expect(markdown).toContain("---");
  });

  test("streaming messages show an ellipsis marker", () => {
    const markdown = conversationMarkdown(
      [
        message({ id: "1", role: "user", text: "q" }),
        message({ id: "2", role: "assistant", text: "", streaming: true }),
      ],
      true,
    );
    expect(markdown).toContain("⋯");
  });

  test("errors render as a plain block", () => {
    const markdown = conversationMarkdown([message({ id: "1", role: "error", text: "OpenCode is not running." })], false);
    expect(markdown).toContain("OpenCode is not running.");
  });
});
