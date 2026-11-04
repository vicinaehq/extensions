import { LocalStorage } from "@vicinae/api";
import { richPrompt } from "./openui.ts";
import type { ProviderId } from "./providers/index.ts";

export type OutputStyle = "full" | "layman" | "custom";

export type ProviderSettings = { apiKey?: string; baseUrl?: string; model?: string };

export type Settings = {
	provider: ProviderId;
	providers: Partial<Record<ProviderId, ProviderSettings>>;
	outputStyle: OutputStyle;
	customStyle?: string;
	/** Let the model add OpenUI blocks (tables, charts, places, buttons). */
	richAnswers: boolean;
	extraPath?: string;
};

const KEY = "settings";

export const DEFAULT_SETTINGS: Settings = { provider: "claude-code", providers: {}, outputStyle: "full", richAnswers: true };

export async function loadSettings(): Promise<Settings> {
	const raw = await LocalStorage.getItem<string>(KEY);
	try {
		return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export const saveSettings = (settings: Settings) => LocalStorage.setItem(KEY, JSON.stringify(settings));

const STYLES: Record<Exclude<OutputStyle, "custom">, string> = {
	full: "Give a complete, well-structured answer in Markdown. Use headings, lists, tables and code blocks where they help.",
	layman:
		"Answer in layman's terms for a non-technical reader. Keep sentences under 20 words, about 15 on average, one idea per sentence. " +
		"Use everyday words. Explain any technical term or abbreviation in the same sentence, or leave it out. " +
		"Say what it means for the reader, not how it works inside. Never drop a fact to make the answer simpler.",
};

export function systemPrompt(settings: Settings): string {
	const style =
		settings.outputStyle === "custom" ? settings.customStyle?.trim() || STYLES.full : STYLES[settings.outputStyle];
	const base = `You answer questions typed into a desktop launcher. Be direct; skip preamble.\n\n${style}`;
	return settings.richAnswers ? `${base}\n\n${richPrompt}` : base;
}
