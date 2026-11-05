import { describe, test, expect } from "bun:test";
import { buildExplainPrompt, buildReviewPrompt } from "../src/lib/prompts";

describe("review prompts", () => {
  test("cover working tree, staged, and branch scopes", () => {
    const working = buildReviewPrompt("working");
    expect(working).toContain("working tree changes");
    expect(working).toContain("Do not modify files.");

    const staged = buildReviewPrompt("staged");
    expect(staged).toContain("staged changes");

    const branch = buildReviewPrompt("branch", { current: "feature/x", default: "main" });
    expect(branch).toContain("branch feature/x relative to main");

    const branchWithoutBase = buildReviewPrompt("branch", { current: "main", default: "main" });
    expect(branchWithoutBase).toContain("branch main");
    expect(branchWithoutBase).not.toContain("relative to main");
  });

  test("can focus on one file", () => {
    const prompt = buildReviewPrompt("working", undefined, "src/a.ts");
    expect(prompt).toContain("working tree changes");
    expect(prompt).toContain("`src/a.ts`");
  });
});

describe("explain prompts", () => {
  test("are scope-aware", () => {
    const working = buildExplainPrompt("working");
    expect(working).toContain("Explain the current working tree changes");

    const staged = buildExplainPrompt("staged");
    expect(staged).toContain("staged changes (git diff --cached)");

    const branch = buildExplainPrompt("branch", { current: "feature/x", default: "main" });
    expect(branch).toContain("branch feature/x relative to main");

    const focused = buildExplainPrompt("staged", undefined, "src/a.ts");
    expect(focused).toContain("`src/a.ts`");
    expect(focused).toContain("Do not modify files.");
  });
});
