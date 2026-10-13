import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { environment } from "@vicinae/api";

const ENTE_DATABASE_URL =
	"https://raw.githubusercontent.com/ente-io/ente/refs/heads/main/mobile/apps/auth/assets/custom-icons/_data/custom-icons.json";
const ENTE_ICONS_URL =
	"https://raw.githubusercontent.com/ente-io/ente/refs/heads/main/mobile/apps/auth/assets/custom-icons/icons/";
const SIMPLE_ICONS_URL = "https://cdn.simpleicons.org/";
const ICONS_DIR = path.join(environment.supportPath, "service_icons");
const MISSES_FILE = path.join(ICONS_DIR, "misses.json");
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type EnteIcon = { title: string; slug?: string; altNames?: string[] };
type IconOutcome = { svg: string | null; transient: boolean };

const NOT_FOUND: IconOutcome = { svg: null, transient: false };
let databasePromise: Promise<EnteIcon[] | null> | undefined;

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function simpleSlug(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function candidates(service: string): string[] {
	const result: string[] = [];
	const seen = new Set<string>();
	const add = (value: string) => {
		const normalised = value.trim().replace(/\s+/g, " ");
		const key = normalised.toLowerCase();
		if (normalised && !seen.has(key)) {
			seen.add(key);
			result.push(normalised);
		}
	};
	const withoutParentheses = service.replace(/\(.*?\)/g, " ");
	add(service);
	add(withoutParentheses);
	const words = withoutParentheses.replace(/\s+/g, " ").trim().split(" ");
	for (let length = words.length - 1; length >= 1; length -= 1)
		add(words.slice(0, length).join(" "));
	return result;
}

function iconPath(service: string): string {
	return path.join(ICONS_DIR, `${slugify(service)}.svg`);
}

export function getIconPath(service: string): string | undefined {
	if (!service) return undefined;
	const file = iconPath(service);
	return existsSync(file) ? file : undefined;
}

export function faviconForNotes(notes: string): string | undefined {
	try {
		const url = new URL(notes);
		if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
		return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;
	} catch {
		return undefined;
	}
}

async function fetchSvg(url: string): Promise<IconOutcome> {
	try {
		const response = await fetch(url);
		if (response.status === 404) return NOT_FOUND;
		if (!response.ok) return { svg: null, transient: true };
		const svg = await response.text();
		return svg.includes("<svg") ? { svg, transient: false } : NOT_FOUND;
	} catch {
		return { svg: null, transient: true };
	}
}

async function enteDatabase(): Promise<EnteIcon[] | null> {
	if (!databasePromise) {
		databasePromise = fetch(ENTE_DATABASE_URL)
			.then(async (response) => {
				if (!response.ok) return null;
				const data = (await response.json()) as { icons?: EnteIcon[] };
				return data.icons ?? [];
			})
			.catch(() => null);
	}
	return databasePromise;
}

async function fetchEnteIcon(service: string): Promise<IconOutcome> {
	const icons = await enteDatabase();
	if (!icons) return { svg: null, transient: true };
	for (const candidate of candidates(service)) {
		const match = icons.find((icon) =>
			[icon.title, icon.slug ?? "", ...(icon.altNames ?? [])].some(
				(name) => name.toLowerCase() === candidate.toLowerCase(),
			),
		);
		if (match)
			return fetchSvg(
				`${ENTE_ICONS_URL}${encodeURIComponent(match.slug || match.title.toLowerCase())}.svg`,
			);
	}
	return NOT_FOUND;
}

async function fetchSimpleIcon(service: string): Promise<IconOutcome> {
	let transient = false;
	const tried = new Set<string>();
	for (const candidate of candidates(service)) {
		const slug = simpleSlug(candidate);
		if (!slug || tried.has(slug)) continue;
		tried.add(slug);
		const outcome = await fetchSvg(`${SIMPLE_ICONS_URL}${slug}`);
		if (outcome.svg) return outcome;
		if (outcome.transient) transient = true;
	}
	return { svg: null, transient };
}

async function readMisses(): Promise<Record<string, number>> {
	try {
		return JSON.parse(await readFile(MISSES_FILE, "utf8")) as Record<
			string,
			number
		>;
	} catch {
		return {};
	}
}

/** Download missing brand icons once per service; icon failures never block TOTP use. */
export async function ensureIcons(
	services: string[],
	force = false,
): Promise<void> {
	const unique = [...new Set(services.filter(Boolean))];
	if (!unique.length) return;
	await mkdir(ICONS_DIR, { recursive: true });
	const misses = await readMisses();
	let changed = false;
	for (const service of unique) {
		const file = iconPath(service);
		if (
			!force &&
			(existsSync(file) ||
				(misses[service] && Date.now() - misses[service] < MISS_TTL_MS))
		)
			continue;
		const ente = await fetchEnteIcon(service);
		const simple = ente.svg ? NOT_FOUND : await fetchSimpleIcon(service);
		const svg = ente.svg ?? simple.svg;
		if (svg) {
			await writeFile(file, svg, "utf8");
			if (service in misses) {
				delete misses[service];
				changed = true;
			}
		} else if (!ente.transient && !simple.transient) {
			misses[service] = Date.now();
			changed = true;
		}
	}
	if (changed) await writeFile(MISSES_FILE, JSON.stringify(misses), "utf8");
}
