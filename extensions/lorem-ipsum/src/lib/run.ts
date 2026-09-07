import { generate, type Kind } from "./generator";
import { getPrefs, produceOutput } from "./output";
import { resolveCount } from "./parse";
import { showToast, Toast } from "@vicinae/api";

export { parseCount, parseQuery, stripKindSuffix, isKind, resolveCount } from "./parse";
export type { ParsedQuery, ParseCountResult } from "./parse";

export async function runNoView(kind: Kind, rawCount: string | undefined): Promise<void> {
  const prefs = getPrefs();
  const builtIn = kind === "list" ? 5 : 1;
  const parsed = resolveCount(rawCount, prefs.defaultCount, builtIn);
  if (!parsed.ok) {
    await showToast({ style: Toast.Style.Failure, title: parsed.message });
    return;
  }

  await produceOutput(
    generate({
      kind,
      count: parsed.value,
      startWithLorem: prefs.startWithLorem,
      listStyle: prefs.listStyle,
      htmlTag: prefs.htmlTag,
    }),
  );
}
