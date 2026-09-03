import { generate, type Kind } from "./generator";
import { getPrefs, produceOutput } from "./output";
import { parseCount } from "./parse";
import { showToast, Toast } from "@vicinae/api";

export { parseCount, parseQuery, stripKindSuffix, isKind } from "./parse";
export type { ParsedQuery, ParseCountResult } from "./parse";

export async function runNoView(kind: Kind, rawCount: string | undefined): Promise<void> {
  const prefs = getPrefs();
  const builtIn = kind === "list" ? 5 : 1;
  const fromPref = parseCount(prefs.defaultCount, builtIn);
  const fallback = fromPref.ok ? fromPref.value : builtIn;
  const parsed = parseCount(rawCount, fallback);
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
