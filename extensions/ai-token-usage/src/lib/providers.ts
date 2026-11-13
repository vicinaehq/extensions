import { getPreferenceValues } from "@vicinae/api";
import { fetchClaudeLimits, type LimitsProvider } from "./limits";
import { fetchOpenRouterLimits, openrouterKey } from "./openrouter";

export const PROVIDERS: LimitsProvider[] = [
	{ id: "claude", name: "Claude Code", readsCredentials: false, fetch: () => fetchClaudeLimits() },
	{
		id: "openrouter",
		name: "OpenRouter",
		readsCredentials: true, // OPENROUTER_API_KEY or the API key preference
		fetch: () =>
			fetchOpenRouterLimits(openrouterKey(getPreferenceValues<{ openrouterApiKey?: string }>().openrouterApiKey)),
	},
];
