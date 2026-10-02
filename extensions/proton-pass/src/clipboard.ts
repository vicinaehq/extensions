import { Clipboard, getPreferenceValues } from "@vicinae/api";

type ClipboardPreferences = {
  copyPasswordTransient?: boolean;
  clipboardClearSeconds?: string;
};

export async function copyProtected(value: string): Promise<void> {
  await Clipboard.copy(value, { concealed: true });
  const preferences = getPreferenceValues<ClipboardPreferences>();
  if (preferences.copyPasswordTransient === false) return;

  const seconds = Number(preferences.clipboardClearSeconds ?? "30");
  const timeout = Number.isFinite(seconds) && seconds > 0 ? seconds : 30;
  setTimeout(async () => {
    try {
      if ((await Clipboard.readText()) === value) await Clipboard.clear();
    } catch {
      // Clipboard clearing is best-effort and must not disturb the action that copied it.
    }
  }, timeout * 1000);
}
