import type { ActionCatalog, ActionSection } from "./types";
import { runCli } from "./umbriel";

function catalogFromSections(sections: ActionSection[]): ActionCatalog {
	const normalized = sections.map((section) => ({
		...section,
		title: section.title === "Apps" ? "Programs" : section.title,
	}));
	const byAction = new Map<string, string>();
	for (const section of normalized) {
		for (const action of section.actions) byAction.set(action, section.title);
	}
	return { sections: normalized, byAction };
}

function parseHelp(help: string): ActionCatalog {
	const sections: ActionSection[] = [];
	let current: ActionSection | null = null;

	for (const line of help.split(/\r?\n/)) {
		if (!line.trim()) continue;

		if (!/^\s/.test(line) && /^[A-Z][A-Za-z &]*$/.test(line.trim())) {
			current = { title: line.trim(), actions: [] };
			sections.push(current);
			continue;
		}

		const action = line.match(/^\s{2,}([a-z][a-z0-9-]*)\b/);
		if (action?.[1] && current) current.actions.push(action[1]);
	}

	return catalogFromSections(sections);
}

let cachedCatalog: ActionCatalog | null = null;

export async function getActionCatalog(): Promise<ActionCatalog> {
	if (cachedCatalog) return cachedCatalog;

	const help = await runCli("msg", "--help");
	const parsed = parseHelp(help);
	if (parsed.byAction.size === 0) {
		throw new Error("Umbriel returned no actions from 'umbriel msg --help'.");
	}

	cachedCatalog = parsed;
	return cachedCatalog;
}
