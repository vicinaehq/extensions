import type { EnhanceStyle, Mode } from "../types/index";

export function getModeLabel(mode: Mode): string {
  switch (mode) {
    case "translate":
      return "Translate";
    case "summarize":
      return "Summarize";
    case "explain":
      return "Explain";
    case "enhance":
      return "Enhance";
    case "dictionary":
      return "Dictionary";
  }
}

export const ENHANCE_STYLES: { value: EnhanceStyle; title: string }[] = [
  { value: "professional", title: "Professional" },
  { value: "casual", title: "Casual" },
  { value: "humorous", title: "Humorous" },
  { value: "academic", title: "Academic" },
  { value: "persuasive", title: "Persuasive" },
  { value: "concise", title: "Concise" },
  { value: "storytelling", title: "Storytelling" },
  { value: "inspiring", title: "Inspiring" },
];

export const ENHANCE_STYLE_DEFINITIONS: Record<EnhanceStyle, string> = {
  professional:
    "Professional — Formal, polished, business-appropriate language. Uses precise vocabulary and clear sentence structure.",
  casual:
    "Casual — Relaxed, conversational, everyday language. Feels natural and approachable.",
  humorous:
    "Humorous — Witty, playful, light-hearted tone. Uses clever wordplay without sacrificing clarity.",
  academic:
    "Academic — Scholarly tone with discipline-appropriate terminology. Structured arguments and precise claims.",
  persuasive:
    "Persuasive — Convincing and compelling tone. Uses rhetorical techniques and calls to action to influence the reader.",
  concise:
    "Concise — Short and direct. Every word earns its place. Removes redundancy without losing meaning.",
  storytelling:
    "Storytelling — Narrative flow with vivid description. Engaging, rhythmic, and immersive.",
  inspiring:
    "Inspiring — Uplifting, motivational, and energetic tone. Empowers the reader and evokes positive emotion.",
};

export function getEnhanceStyleLabel(style: EnhanceStyle): string {
  return ENHANCE_STYLES.find((s) => s.value === style)?.title ?? style;
}
