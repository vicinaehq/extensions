import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "./exec";

export type FlathubApp = {
	app_id: string;
	name: string;
	summary: string;
	icon?: string;
	project_license?: string;
	installs_last_month?: number;
	trending?: number;
	favorites_count?: number;
	description?: string;
	developer_name?: string;
	screenshots?: Array<{
		caption?: string;
		default?: boolean;
		sizes: Array<{
			src: string;
			width: string;
			height: string;
			scale?: string;
		}>;
	}>;
	releases?: Array<{
		version: string;
		timestamp: number;
		description?: string;
	}>;
};

const FLATHUB_APP_DETAIL_URL = "https://flathub.org/api/v2/appstream";

export async function fetchAppDetails(appId: string): Promise<FlathubApp> {
	const response = await fetch(
		`${FLATHUB_APP_DETAIL_URL}/${encodeURIComponent(appId)}`,
		{
			signal: AbortSignal.timeout(10_000),
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch app details: ${response.status}`);
	}

	return (await response.json()) as FlathubApp;
}

/** A Flathub application as listed by the local `flatpak` CLI. */
export type FlathubListedApp = {
	name: string;
	arch: string;
	version: string;
	branch: string;
	origin: string;
};

const LIST_COLUMNS = "application,arch,version,branch,origin";

let appstreamIconDirs: string[] | null = null;

function getAppstreamIconDirs(): string[] {
	if (appstreamIconDirs) return appstreamIconDirs;
	const dirs: string[] = [];
	for (const root of [
		"/var/lib/flatpak/appstream/flathub",
		join(homedir(), ".local/share/flatpak/appstream/flathub"),
	]) {
		try {
			for (const arch of readdirSync(root)) {
				for (const commit of readdirSync(join(root, arch))) {
					for (const size of ["128x128", "64x64"]) {
						dirs.push(join(root, arch, commit, "icons", size));
					}
				}
			}
		} catch {
			// directory does not exist on this system
		}
	}
	appstreamIconDirs = dirs;
	return dirs;
}

/**
 * Find a local icon file for a Flathub application, if one is available in the
 * appstream metadata cache or the exported hicolor theme.
 */
export function findFlatpakIcon(appId: string): string | null {
	for (const dir of getAppstreamIconDirs()) {
		const icon = join(dir, `${appId}.png`);
		if (existsSync(icon)) return icon;
	}
	for (const root of [
		"/var/lib/flatpak/exports/share/icons",
		join(homedir(), ".local/share/flatpak/exports/share/icons"),
	]) {
		const svg = join(root, "hicolor/scalable/apps", `${appId}.svg`);
		if (existsSync(svg)) return svg;
		const png = join(root, "hicolor/128x128/apps", `${appId}.png`);
		if (existsSync(png)) return png;
	}
	return null;
}

function parseFlatpakTabular(output: string): FlathubListedApp[] {
	const apps: FlathubListedApp[] = [];
	for (const line of output.split("\n")) {
		const parts = line.split("\t");
		const name = parts[0]?.trim();
		if (!name) continue;
		apps.push({
			name,
			arch: parts[1]?.trim() ?? "",
			version: parts[2]?.trim() ?? "",
			branch: parts[3]?.trim() ?? "",
			origin: parts[4]?.trim() ?? "",
		});
	}
	return apps;
}

/**
 * List installed Flatpak applications (system + user).
 */
export async function fetchFlathubInstalled(): Promise<FlathubListedApp[]> {
	const result = await run(
		"flatpak",
		["list", "--app", `--columns=${LIST_COLUMNS}`],
		{ timeout: 60_000 },
	);
	if (!result.ok) return [];
	return parseFlatpakTabular(result.stdout);
}

/**
 * List all applications available from the Flathub remote.
 */
export async function fetchFlathubRemote(): Promise<FlathubListedApp[]> {
	const result = await run(
		"flatpak",
		["remote-ls", "flathub", "--app", `--columns=${LIST_COLUMNS}`],
		{ timeout: 120_000 },
	);
	if (!result.ok) return [];
	return parseFlatpakTabular(result.stdout);
}

/**
 * Build the markdown for a Flathub app's side-panel detail.
 */
export function buildDetailMarkdown(
	screenshots: NonNullable<FlathubApp["screenshots"]>,
	app: FlathubApp,
	displayApp: FlathubApp,
): string {
	const name = displayApp.name || app.name || app.app_id;
	const lines: string[] = [];
	lines.push(`# ${name}`);
	if (displayApp.summary) lines.push(`${displayApp.summary}`);
	if (displayApp.description) {
		lines.push("");
		lines.push(displayApp.description);
	}
	for (const shot of screenshots ?? []) {
		const sizes = shot.sizes ?? [];
		const image = sizes.find((size) => Number(size.width) >= 600) ?? sizes[0];
		if (image?.src) {
			lines.push(`\n![${shot.caption ?? name}](${image.src})`);
		}
	}
	return lines.join("\n");
}

/** Format an install count, e.g. `12300` -> `12.3k`. */
export function formatInstalls(installs: number): string {
	if (installs >= 1_000_000) return `${(installs / 1_000_000).toFixed(1)}M`;
	if (installs >= 1_000) return `${(installs / 1_000).toFixed(1)}k`;
	return String(installs);
}