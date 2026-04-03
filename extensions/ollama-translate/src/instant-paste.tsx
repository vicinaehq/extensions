import { Clipboard, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { getLangName, translateText } from "./api/ollama";
import {
	DEFAULT_MODEL,
	DEFAULT_OLLAMA_HOST,
	DEFAULT_TARGET_LANG,
	type ExtensionPreferences,
} from "./constants";

export default async function InstantPaste() {
	const prefs = getPreferenceValues<ExtensionPreferences>();
	const ollamaHost = prefs.ollamaHost || DEFAULT_OLLAMA_HOST;
	const model = prefs.defaultModel || DEFAULT_MODEL;
	const targetLang = prefs.defaultTargetLang || DEFAULT_TARGET_LANG;
	const targetLangName = getLangName(targetLang);

	try {
		await showToast(
			Toast.Style.Animated,
			`Translating to ${targetLangName}...`,
		);

		const text = await Clipboard.readText();
		if (!text?.trim()) {
			await showToast(Toast.Style.Failure, "No text in clipboard");
			return;
		}

		const result = await translateText(
			text,
			"auto",
			targetLang,
			model,
			ollamaHost,
		);
		await Clipboard.paste(result);

		await showToast(
			Toast.Style.Success,
			"✓ Pasted",
			result.substring(0, 60) + (result.length > 60 ? "..." : ""),
		);
	} catch (error) {
		await showToast(Toast.Style.Failure, "Translation failed", String(error));
	}
}
