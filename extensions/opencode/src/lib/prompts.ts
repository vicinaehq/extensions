/** Reusable prompt builders. They route work to OpenCode. They do not add AI logic. */

export type ReviewScope = "working" | "staged" | "branch";

export interface BranchInfo {
  readonly current?: string;
  readonly default?: string;
}

function branchTarget(branch?: BranchInfo): { target: string; relativeTo: string } {
  const current = branch?.current;
  const base = branch?.default;
  return {
    target: current ? `branch ${current}` : "the current branch",
    relativeTo: base && base !== current ? ` relative to ${base}` : "",
  };
}

function scopeNoun(scope: ReviewScope, branch?: BranchInfo): string {
  if (scope === "working") return "the current working tree changes";
  if (scope === "staged") return "the currently staged changes (git diff --cached)";
  const { target, relativeTo } = branchTarget(branch);
  return `the committed changes on ${target}${relativeTo}`;
}

function withFileFocus(prompt: string, file?: string): string {
  return file ? `${prompt}\nFocus on the file \`${file}\`.` : prompt;
}

/** Build the repository review prompt. OpenCode inspects the repository itself. */
export function buildReviewPrompt(scope: ReviewScope, branch?: BranchInfo, file?: string): string {
  const guard = "Do not modify files.";
  return withFileFocus(
    `Review ${scopeNoun(scope, branch)}.\nIdentify correctness issues, regressions, security problems, and suspicious changes. ${guard}`,
    file,
  );
}

/** Build the explain-changes prompt for a scope, optionally focused on one file. */
export function buildExplainPrompt(scope: ReviewScope, branch?: BranchInfo, file?: string): string {
  const guard = "Do not modify files.";
  return withFileFocus(
    `Explain ${scopeNoun(scope, branch)}.\nDescribe what changed and why it might matter. ${guard}`,
    file,
  );
}
