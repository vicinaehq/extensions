import { Clipboard, closeMainWindow, getPreferenceValues, showHUD, showToast, Toast } from "@vicinae/api";
import type { HtmlTag, ListStyle } from "./generator";

export type ActionPreference = "clipboard" | "paste" | "pasteAndCopy";

export interface Preferences {
  action: ActionPreference;
  startWithLorem: boolean;
  listStyle: ListStyle;
  htmlTag: HtmlTag;
  defaultCount?: string;
}

const LIST_STYLES: ListStyle[] = ["dash", "numbered", "html"];
const HTML_TAGS: HtmlTag[] = ["p", "div"];

export function getPrefs(): Preferences {
  const raw = getPreferenceValues<ExtensionPreferences & { defaultCount?: string }>();
  return {
    action: raw.action ?? "paste",
    startWithLorem: raw.startWithLorem ?? true,
    listStyle: isListStyle(raw.listStyle) ? raw.listStyle : "dash",
    htmlTag: isHtmlTag(raw.htmlTag) ? raw.htmlTag : "p",
    defaultCount: raw.defaultCount,
  };
}

export async function produceOutput(content: string, action = getPrefs().action): Promise<void> {
  try {
    if (action === "paste" || action === "pasteAndCopy") {
      await closeMainWindow();
      await Clipboard.paste(content);
      if (action === "pasteAndCopy") {
        await Clipboard.copy(content);
      }
      await showHUD(action === "pasteAndCopy" ? "Pasted and copied" : "Pasted");
      return;
    }

    await Clipboard.copy(content);
    await showHUD("Copied to clipboard");
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: action === "clipboard" ? "Couldn't copy" : "Couldn't paste",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function isListStyle(value: string | undefined): value is ListStyle {
  return value != null && (LIST_STYLES as string[]).includes(value);
}

function isHtmlTag(value: string | undefined): value is HtmlTag {
  return value != null && (HTML_TAGS as string[]).includes(value);
}
