import { MAX_TEXT_LENGTH, type InputSnapshot } from "./types";

const PLACEHOLDERS = /\{(selection|clipboard)\}/g;

export function inputSources(template: string): (keyof InputSnapshot)[] {
  return [
    ...new Set(
      [...template.matchAll(PLACEHOLDERS)].map(
        (match) => match[1] as keyof InputSnapshot,
      ),
    ),
  ];
}

export function renderTemplate(template: string, input: InputSnapshot): string {
  if (!template.trim())
    throw new Error("Write a prompt for this command first.");
  for (const source of inputSources(template)) {
    if (!input[source]?.trim()) {
      throw new Error(
        source === "selection"
          ? "No selected text is available. Select text in the source app, then run the command again."
          : "The clipboard does not contain text. Copy some text, then run the command again.",
      );
    }
  }
  // A single pass keeps placeholders inside selected/copied text literal.
  const rendered = template.replace(
    PLACEHOLDERS,
    (_match, source: keyof InputSnapshot) => input[source]!,
  );
  if (rendered.length > MAX_TEXT_LENGTH)
    throw new Error(
      "The input is too large. Select a smaller passage (up to 512,000 characters).",
    );
  return rendered;
}

export function plainTextMarkdown(text: string): string {
  // Vicinae wraps paragraphs, but not fenced code blocks. Escape both Markdown
  // and HTML so model output remains literal and cannot load remote images.
  // This representation is only for display; copy/paste always uses raw text.
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}\[\]()#+=.!|~\-]/g, "\\$&")
    .replace(/^[ \t]+/gm, (indent) =>
      indent.replace(/ /g, "&#160;").replace(/\t/g, "&#160;&#160;&#160;&#160;"),
    )
    .replace(/\r\n|\r|\n/g, "  \n");
}

export function refinementPrompt(
  originalPrompt: string,
  previousResult: string,
  instruction: string,
): string {
  if (!instruction.trim())
    throw new Error("Write an instruction for the refinement.");
  const prompt = `Original request:\n${originalPrompt}\n\nPrevious result:\n${previousResult}\n\nRefine the previous result with this instruction:\n${instruction}`;
  if (prompt.length > MAX_TEXT_LENGTH)
    throw new Error(
      "This conversation is too large to refine. Start a new run with a smaller passage.",
    );
  return prompt;
}
