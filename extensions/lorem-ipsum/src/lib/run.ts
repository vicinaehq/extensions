import { generate, MAX_COUNT, type Kind } from "./generator";
import { getPrefs, produceOutput } from "./output";
import { showToast, Toast } from "@vicinae/api";

export function parseCount(
  raw: string | undefined,
  fallback = 1,
): { ok: true; value: number } | { ok: false; message: string } {
  if (raw == null || raw.trim() === "") {
    return { ok: true, value: fallback };
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message: "Enter a whole number of at least 1." };
  }

  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) {
    return { ok: false, message: "Enter a whole number of at least 1." };
  }
  if (n > MAX_COUNT) {
    return { ok: false, message: `Keep the count at ${MAX_COUNT} or below.` };
  }
  return { ok: true, value: n };
}

const QUERY_RE =
  /^(\d+)\s*(paragraphs?|para|sentences?|sent|words?|titles?|items?|list|html|p|s|w|t|l|h)?$/i;

export function parseQuery(query: string): { count?: number; kind?: Kind } {
  const trimmed = query.trim();
  if (!trimmed) return {};

  const match = QUERY_RE.exec(trimmed);
  if (!match) return {};

  const count = Number(match[1]);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) return {};

  const suffix = match[2]?.toLowerCase();
  let kind: Kind | undefined;
  if (suffix) {
    const key = suffix[0];
    if (key === "p") kind = "paragraphs";
    else if (key === "s") kind = "sentences";
    else if (key === "w") kind = "words";
    else if (key === "t") kind = "titles";
    else if (key === "l" || key === "i") kind = "list";
    else if (key === "h") kind = "html";
  }

  return { count, kind };
}

export async function runNoView(kind: Kind, rawCount: string | undefined, fallback = 1): Promise<void> {
  const parsed = parseCount(rawCount, fallback);
  if (!parsed.ok) {
    await showToast({ style: Toast.Style.Failure, title: parsed.message });
    return;
  }

  const { startWithLorem } = getPrefs();
  await produceOutput(generate({ kind, count: parsed.value, startWithLorem }));
}
