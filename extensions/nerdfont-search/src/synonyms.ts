import searchConfig from "./search-config.json";

export const ACRONYMS = new Set(searchConfig.acronyms);

export const TOKEN_SYNONYMS =
	searchConfig.tokenSynonyms as Record<string, string[]>;

export function addSynonyms(token: string): string[] {
	const synonyms = TOKEN_SYNONYMS[token] ?? [];
	const extras: string[] = [];

	if (token === "plus") {
		extras.push("+", "add");
	}
	if (token === "minus") {
		extras.push("-", "subtract");
	}
	if (token === "times") {
		extras.push("x");
	}
	if (token === "close") {
		extras.push("quit");
	}

	return [...synonyms, ...extras].map((entry) => entry.toLowerCase());
}
