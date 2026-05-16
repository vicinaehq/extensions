import { grimBackend } from "./grim";
import { grimblastBackend } from "./grimblast";
import { x11ScrotBackend } from "./x11-scrot";
import { maimBackend } from "./maim";
import { flameshotBackend } from "./flameshot";
import { spectacleBackend } from "./spectacle";
import { gnomeScreenshotBackend } from "./gnome-screenshot";
import { screencaptureBackend } from "./screencapture";
import { screenshotDesktopBackend } from "./screenshot-desktop";
import type { CaptureBackend } from "./types";

export type { CaptureBackend, CaptureMode } from "./types";

// Priority order for auto-detection - screenshot-desktop last (native tools preferred)
export const ALL_BACKENDS: CaptureBackend[] = [
	grimblastBackend,
	grimBackend,
	spectacleBackend,
	gnomeScreenshotBackend,
	flameshotBackend,
	maimBackend,
	x11ScrotBackend,
	screencaptureBackend,
	screenshotDesktopBackend,
];

export const getBackend = (id: string): CaptureBackend | null => {
	if (id === "auto") {
		return ALL_BACKENDS.find((b) => b.isAvailable()) ?? null;
	}
	return ALL_BACKENDS.find((b) => b.id === id) ?? null;
};
