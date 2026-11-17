import { createHash } from "node:crypto";
import { getPreferenceValues } from "@vicinae/api";
import { fetchClaudeLimits, type LimitsProvider } from "./limits";
import { fetchOpenRouterLimits, openrouterKey } from "./openrouter";

const currentOpenrouterKey = () => openrouterKey(getPreferenceValues<{ openrouterApiKey?: string }>().openrouterApiKey);

// One-way and short: tells keys apart without storing anything that reveals the key.
const fingerprint = (secret: string | undefined) =>
	secret ? createHash("sha256").update(secret).digest("hex").slice(0, 12) : undefined;

export const PROVIDERS: LimitsProvider[] = [
	{ id: "claude", name: "Claude Code", readsCredentials: false, fetch: () => fetchClaudeLimits() },
	{
		id: "openrouter",
		name: "OpenRouter",
		readsCredentials: true, // OPENROUTER_API_KEY or the API key preference
		config: () => fingerprint(currentOpenrouterKey()),
		fetch: () => fetchOpenRouterLimits(currentOpenrouterKey()),
	},
];
