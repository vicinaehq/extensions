import {
	environment,
	LocalStorage,
	showToast,
	Toast,
	Wallpaper,
} from "@vicinae/api";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { WallpaperResult } from "./wallhaven";

const downloadsDir = path.join(environment.supportPath, "downloads");

const HISTORY_KEY = "downloads";
const HISTORY_LIMIT = 50;

export type DownloadedWallpaper = {
	id: string;
	url: string;
	source: string;
	resolution: string;
	file: string;
	downloadedAt: number;
};

const readHistory = async (): Promise<DownloadedWallpaper[]> => {
	const raw = await LocalStorage.getItem<string>(HISTORY_KEY);
	if (!raw) return [];
	try {
		return JSON.parse(raw) as DownloadedWallpaper[];
	} catch {
		return [];
	}
};

const writeHistory = (entries: DownloadedWallpaper[]) =>
	LocalStorage.setItem(HISTORY_KEY, JSON.stringify(entries));

const fileExists = (file: string) =>
	fsp.access(file).then(
		() => true,
		() => false,
	);

export const getDownloadHistory = async (): Promise<DownloadedWallpaper[]> => {
	const entries = await readHistory();

	const kept = (
		await Promise.all(
			entries.map(async (entry) =>
				(await fileExists(entry.file)) ? entry : undefined,
			),
		)
	).filter((entry) => entry !== undefined);

	if (kept.length !== entries.length) await writeHistory(kept);

	return kept;
};

export const removeFromDownloadHistory = async (entry: DownloadedWallpaper) => {
	await fsp.rm(entry.file, { force: true });
	const entries = await readHistory();
	await writeHistory(entries.filter((e) => e.id !== entry.id));
};

const download = async (
	wallpaper: WallpaperResult,
): Promise<DownloadedWallpaper> => {
	const res = await fetch(wallpaper.path);
	if (!res.ok) throw new Error(`Download failed (${res.status})`);
	const bytes = await res.bytes();

	const ext = path.extname(new URL(wallpaper.path).pathname);
	const file = path.join(downloadsDir, `${wallpaper.id}${ext}`);
	await fsp.mkdir(downloadsDir, { recursive: true });
	await fsp.writeFile(file, bytes);

	const entry: DownloadedWallpaper = {
		id: wallpaper.id,
		url: wallpaper.url,
		source: wallpaper.path,
		resolution: wallpaper.resolution,
		file,
		downloadedAt: Date.now(),
	};

	const history = await readHistory();
	const updated = [entry, ...history.filter((e) => e.id !== entry.id)];
	const evicted = updated.slice(HISTORY_LIMIT);
	await writeHistory(updated.slice(0, HISTORY_LIMIT));
	await Promise.all(
		evicted
			.filter((e) => e.file !== entry.file)
			.map((e) => fsp.rm(e.file, { force: true })),
	);

	return entry;
};

export const downloadAndSetWallpaper = async (wallpaper: WallpaperResult) => {
	const toast = await showToast({
		title: "Downloading...",
		style: Toast.Style.Animated,
	});

	try {
		const { file } = await download(wallpaper);
		toast.title = "Setting as wallpaper...";
		await Wallpaper.set(file);
		toast.title = "Wallpaper changed!";
		toast.style = Toast.Style.Success;
	} catch (error) {
		toast.title = "Failed to set wallpaper";
		toast.message = error instanceof Error ? error.message : undefined;
		toast.style = Toast.Style.Failure;
	}
};

export const setAsWallpaper = async (entry: DownloadedWallpaper) => {
	const toast = await showToast({
		title: "Setting as wallpaper...",
		style: Toast.Style.Animated,
	});

	try {
		await Wallpaper.set(entry.file);
		toast.title = "Wallpaper changed!";
		toast.style = Toast.Style.Success;
	} catch (error) {
		toast.title = "Failed to set wallpaper";
		toast.message = error instanceof Error ? error.message : undefined;
		toast.style = Toast.Style.Failure;
	}
};
