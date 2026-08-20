import { grimBackend } from "./grim";
import { grimblastBackend } from "./grimblast";
import { x11ScrotBackend } from "./x11-scrot";
import { maimBackend } from "./maim";
import { flameshotBackend } from "./flameshot";
import { spectacleBackend } from "./spectacle";
import { gnomeScreenshotBackend } from "./gnome-screenshot";
import { screencaptureBackend } from "./screencapture";
import { screenshotDesktopBackend } from "./screenshot-desktop";
import type { CaptureBackend, CaptureMode } from "./types";

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

export type Session = "wayland" | "x11" | "darwin" | "win32";

/**
 * Wayland is not one capture environment. grim and grimblast speak the
 * wlroots-only `wlr-screencopy` protocol, which KWin and Mutter do not
 * implement: on KDE or GNOME they fail with "compositor doesn't support the
 * screen capture protocol" even though the binary is installed and the session
 * is Wayland. Backends listed here are only eligible on a wlroots compositor.
 */
const WLROOTS_ONLY = new Set(["grim", "grimblast"]);

const isWlrootsCompositor = (): boolean => {
	if (
		process.env.HYPRLAND_INSTANCE_SIGNATURE ||
		process.env.SWAYSOCK ||
		process.env.NIRI_SOCKET
	) {
		return true;
	}
	const desktop = (process.env.XDG_CURRENT_DESKTOP ?? "").toLowerCase();
	if (!desktop) return false;
	return ["hyprland", "sway", "niri", "river", "wlroots", "labwc"].some((c) =>
		desktop.includes(c),
	);
};

/**
 * Desktops that ship their own capture tool: preferring it avoids falling
 * through to a generic tool that the session's compositor cannot drive.
 */
const preferredBackendForDesktop = (): string | null => {
	const desktop = (process.env.XDG_CURRENT_DESKTOP ?? "").toLowerCase();
	if (desktop.includes("kde") || desktop.includes("plasma")) return "spectacle";
	if (desktop.includes("gnome")) return "gnome-screenshot";
	return null;
};

/**
 * Which display environments each backend can actually drive. Availability on
 * PATH is not enough: an installed Wayland tool cannot capture an X11 session
 * and vice versa, so a compatibility check has to run before the priority order.
 */
const BACKEND_SESSIONS: Record<string, Session[]> = {
	grimblast: ["wayland"],
	grim: ["wayland"],
	spectacle: ["wayland", "x11"],
	"gnome-screenshot": ["wayland", "x11"],
	flameshot: ["wayland", "x11"],
	maim: ["x11"],
	"x11-scrot": ["x11"],
	screencapture: ["darwin"],
	"screenshot-desktop": ["darwin", "win32"],
};

export const detectSession = (): Session => {
	if (process.platform === "darwin") return "darwin";
	if (process.platform === "win32") return "win32";
	if (process.env.XDG_SESSION_TYPE === "x11") return "x11";
	if (!process.env.WAYLAND_DISPLAY && process.env.DISPLAY) return "x11";
	return "wayland";
};

const isCompatible = (backend: CaptureBackend, session: Session): boolean => {
	if (!(BACKEND_SESSIONS[backend.id] ?? []).includes(session)) return false;
	if (session === "wayland" && WLROOTS_ONLY.has(backend.id)) {
		return isWlrootsCompositor();
	}
	return true;
};

const autoDetect = (mode?: CaptureMode): CaptureBackend | null => {
	const session = detectSession();
	const eligible = ALL_BACKENDS.filter(
		(b) =>
			isCompatible(b, session) &&
			(mode === undefined || b.supportedModes.includes(mode)) &&
			b.isAvailable(),
	);
	const preferred = preferredBackendForDesktop();
	return (
		(preferred ? eligible.find((b) => b.id === preferred) : undefined) ??
		eligible[0] ??
		null
	);
};

export const getBackend = (id: string): CaptureBackend | null => {
	if (id === "auto") return autoDetect();
	return ALL_BACKENDS.find((b) => b.id === id) ?? null;
};

/**
 * Resolves a backend that can actually serve `mode`. A configured tool that
 * does not support the requested mode (or does not fit the current session)
 * falls back to auto-detection for that mode rather than failing at capture time.
 */
export const getBackendForMode = (
	id: string,
	mode: CaptureMode,
): CaptureBackend | null => {
	if (id !== "auto") {
		const chosen = ALL_BACKENDS.find((b) => b.id === id);
		if (
			chosen &&
			chosen.supportedModes.includes(mode) &&
			isCompatible(chosen, detectSession()) &&
			chosen.isAvailable()
		) {
			return chosen;
		}
	}
	return autoDetect(mode);
};
