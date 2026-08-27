import { Clipboard, closeMainWindow, getPreferenceValues, showHUD, showToast, Toast } from "@vicinae/api";

export type ActionPreference = "clipboard" | "paste" | "pasteAndCopy";

export interface Preferences {
  action: ActionPreference;
  startWithLorem: boolean;
}

export function getPrefs(): Preferences {
  const raw = getPreferenceValues<ExtensionPreferences>();
  return {
    action: raw.action ?? "paste",
    startWithLorem: raw.startWithLorem ?? true,
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

export function actionLabel(action: ActionPreference): string {
  switch (action) {
    case "paste":
      return "Paste";
    case "pasteAndCopy":
      return "Paste and Copy";
    default:
      return "Copy to Clipboard";
  }
}
