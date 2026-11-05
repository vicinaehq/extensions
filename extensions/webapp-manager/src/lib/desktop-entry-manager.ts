import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decode as decodeWebp } from "@cwasm/webp";
import { encode as encodePng } from "fast-png";

export type WindowManager = "niri" | "hyprland" | "sway" | "i3" | "custom";
export type WindowMatchMode = "app-id" | "class" | "title" | "any";

export type ManagedDesktopEntry = {
	id: string;
	name: string;
	url: string;
	comment?: string;
	shortcut?: string;
	browserCommand: string;
	browserArgsTemplate: string;
	singleWindow: boolean;
	windowMatchMode: WindowMatchMode;
	windowMatchValue?: string;
	windowManager: WindowManager;
	customFocusCommandTemplate?: string;
	desktopFilePath: string;
	desktopFileName: string;
	launcherScriptPath?: string;
	icon?: string;
	updatedAt?: Date;
};

export type EntryDraft = {
	name: string;
	url: string;
	comment?: string;
	shortcut?: string;
	browserCommand: string;
	browserArgsTemplate: string;
	singleWindow: boolean;
	windowMatchMode: WindowMatchMode;
	downloadFavicon: boolean;
};

type SaveEntryOptions = {
	directory: string;
	iconDirectory: string;
	launcherDirectory: string;
	stateDirectory: string;
	windowManager: WindowManager;
	customFocusCommandTemplate?: string;
	draft: EntryDraft;
	existingEntry?: ManagedDesktopEntry;
};

const MANAGED_MARKER_KEY = "X-Vicinae-Managed";
const MANAGED_MARKER_VALUE = "true";
const MANAGED_ID_KEY = "X-Vicinae-EntryID";
const MANAGED_URL_KEY = "X-Vicinae-URL";
const MANAGED_SHORTCUT_KEY = "X-Vicinae-Shortcut";
const MANAGED_COMMAND_KEY = "X-Vicinae-BrowserCommand";
const MANAGED_ARGS_KEY = "X-Vicinae-BrowserArgsTemplate";
const MANAGED_SINGLE_WINDOW_KEY = "X-Vicinae-SingleWindow";
const MANAGED_MATCH_MODE_KEY = "X-Vicinae-WindowMatchMode";
const MANAGED_MATCH_VALUE_KEY = "X-Vicinae-WindowMatchValue";
const MANAGED_WM_KEY = "X-Vicinae-WindowManager";
const MANAGED_CUSTOM_FOCUS_KEY = "X-Vicinae-CustomFocusCommand";
const MANAGED_LAUNCHER_KEY = "X-Vicinae-LauncherScript";
const MANAGED_STATE_PREFIX_KEY = "X-Vicinae-WindowStatePrefix";
const MANAGED_VERSION_KEY = "X-Vicinae-Version";
const MANAGED_VERSION_VALUE = "3";

const WINDOW_MANAGERS: WindowManager[] = [
	"niri",
	"hyprland",
	"sway",
	"i3",
	"custom",
];
const WINDOW_MATCH_MODES: WindowMatchMode[] = [
	"app-id",
	"class",
	"title",
	"any",
];

export const DEFAULT_DESKTOP_DIRECTORY = "~/.local/share/applications";
export const DEFAULT_BROWSER_COMMAND = "chromium-browser";
export const DEFAULT_BROWSER_ARGS_TEMPLATE = "--app={url}";
export const DEFAULT_WINDOW_MANAGER: WindowManager = "niri";
export const DEFAULT_WINDOW_MATCH_MODE: WindowMatchMode = "app-id";

export function resolvePath(inputPath: string): string {
	const trimmed = inputPath.trim();
	if (trimmed === "~") {
		return os.homedir();
	}
	if (trimmed.startsWith("~/")) {
		return path.join(os.homedir(), trimmed.slice(2));
	}
	return trimmed;
}

export function parseWindowManager(value: unknown): WindowManager {
	if (
		typeof value === "string" &&
		WINDOW_MANAGERS.includes(value as WindowManager)
	) {
		return value as WindowManager;
	}
	return DEFAULT_WINDOW_MANAGER;
}

export function parseWindowMatchMode(value: unknown): WindowMatchMode {
	if (
		typeof value === "string" &&
		WINDOW_MATCH_MODES.includes(value as WindowMatchMode)
	) {
		return value as WindowMatchMode;
	}
	return DEFAULT_WINDOW_MATCH_MODE;
}

export async function listManagedEntries(
	directory: string,
): Promise<ManagedDesktopEntry[]> {
	await fs.mkdir(directory, { recursive: true });
	const files = await fs.readdir(directory, { withFileTypes: true });
	const entries = await Promise.all(
		files
			.filter((file) => file.isFile() && file.name.endsWith(".desktop"))
			.map((file) =>
				parseManagedEntry(path.join(directory, file.name)).catch(
					() => undefined,
				),
			),
	);

	return entries
		.filter((entry): entry is ManagedDesktopEntry => Boolean(entry))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveManagedEntry(
	options: SaveEntryOptions,
): Promise<ManagedDesktopEntry> {
	const directory = resolvePath(options.directory || DEFAULT_DESKTOP_DIRECTORY);
	await fs.mkdir(directory, { recursive: true });
	await fs.mkdir(options.iconDirectory, { recursive: true });
	await fs.mkdir(options.launcherDirectory, { recursive: true });
	await fs.mkdir(options.stateDirectory, { recursive: true });

	const normalizedUrl = normalizeUrl(options.draft.url);
	const browserCommand = options.draft.browserCommand.trim();
	if (!browserCommand) {
		throw new Error("Browser command cannot be empty.");
	}

	const browserArgsTemplate =
		options.draft.browserArgsTemplate.trim() || DEFAULT_BROWSER_ARGS_TEMPLATE;
	const shortcut = options.draft.shortcut?.trim() || undefined;
	const singleWindow = options.draft.singleWindow;
	const windowMatchMode = parseWindowMatchMode(options.draft.windowMatchMode);
	const windowManager = parseWindowManager(options.windowManager);
	const customFocusCommandTemplate =
		options.customFocusCommandTemplate?.trim() || undefined;

	const id = options.existingEntry?.id ?? randomUUID();
	const desktopFileName =
		options.existingEntry?.desktopFileName ??
		(await getUniqueDesktopFileName(
			directory,
			slugifyName(options.draft.name),
		));
	const desktopFilePath = path.join(directory, desktopFileName);
	const launcherScriptPath = path.join(options.launcherDirectory, `${id}.sh`);
	const statePrefix = path.join(options.stateDirectory, id);

	let icon = options.existingEntry?.icon;
	if (options.draft.downloadFavicon) {
		const downloadedIcon = await downloadFavicon(
			normalizedUrl,
			id,
			options.iconDirectory,
		);
		if (downloadedIcon) {
			icon = downloadedIcon;
		}
	}

	const launchTokens = buildLaunchCommandTokens(
		browserCommand,
		browserArgsTemplate,
		normalizedUrl,
	);
	await writeLauncherScript({
		launcherScriptPath,
		launchTokens,
		singleWindow,
		windowMatchMode,
		windowManager,
		customFocusCommandTemplate: customFocusCommandTemplate || "",
		statePrefix,
	});

	if (singleWindow && options.existingEntry?.windowMatchValue?.trim()) {
		const legacyValue = options.existingEntry.windowMatchValue.trim();
		const stateFile = `${statePrefix}.${windowMatchMode}`;
		try {
			await fs.access(stateFile, fsConstants.F_OK);
		} catch {
			await fs.writeFile(stateFile, legacyValue, "utf8");
		}
	}

	const lines = [
		"[Desktop Entry]",
		"Version=1.0",
		"Type=Application",
		`Name=${sanitizeDesktopValue(options.draft.name)}`,
		options.draft.comment?.trim()
			? `Comment=${sanitizeDesktopValue(options.draft.comment.trim())}`
			: undefined,
		`Exec=${quoteExecToken(launcherScriptPath)}`,
		`Icon=${sanitizeDesktopValue(icon || "web-browser")}`,
		"Terminal=false",
		"StartupNotify=true",
		"Categories=Network;",
		`${MANAGED_MARKER_KEY}=${MANAGED_MARKER_VALUE}`,
		`${MANAGED_VERSION_KEY}=${MANAGED_VERSION_VALUE}`,
		`${MANAGED_ID_KEY}=${sanitizeDesktopValue(id)}`,
		`${MANAGED_URL_KEY}=${sanitizeDesktopValue(normalizedUrl)}`,
		shortcut
			? `${MANAGED_SHORTCUT_KEY}=${sanitizeDesktopValue(shortcut)}`
			: undefined,
		`${MANAGED_COMMAND_KEY}=${sanitizeDesktopValue(browserCommand)}`,
		`${MANAGED_ARGS_KEY}=${sanitizeDesktopValue(browserArgsTemplate)}`,
		`${MANAGED_SINGLE_WINDOW_KEY}=${singleWindow ? "true" : "false"}`,
		`${MANAGED_MATCH_MODE_KEY}=${windowMatchMode}`,
		`${MANAGED_WM_KEY}=${windowManager}`,
		customFocusCommandTemplate
			? `${MANAGED_CUSTOM_FOCUS_KEY}=${sanitizeDesktopValue(customFocusCommandTemplate)}`
			: undefined,
		`${MANAGED_LAUNCHER_KEY}=${sanitizeDesktopValue(launcherScriptPath)}`,
		`${MANAGED_STATE_PREFIX_KEY}=${sanitizeDesktopValue(statePrefix)}`,
	].filter((line): line is string => Boolean(line));

	await fs.writeFile(desktopFilePath, `${lines.join("\n")}\n`, "utf8");
	await fs.chmod(desktopFilePath, 0o755).catch(() => {
		/* best effort */
	});

	return {
		id,
		name: options.draft.name.trim(),
		url: normalizedUrl,
		comment: options.draft.comment?.trim() || undefined,
		shortcut,
		browserCommand,
		browserArgsTemplate,
		singleWindow,
		windowMatchMode,
		windowManager,
		customFocusCommandTemplate,
		desktopFilePath,
		desktopFileName,
		launcherScriptPath,
		icon,
		updatedAt: new Date(),
	};
}

export async function deleteManagedEntry(
	entry: ManagedDesktopEntry,
	iconDirectory: string,
	launcherDirectory: string,
	stateDirectory: string,
): Promise<void> {
	await fs
		.unlink(entry.desktopFilePath)
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") {
				throw error;
			}
		});

	await removeOldIcons(entry.id, iconDirectory);

	const launcherPath =
		entry.launcherScriptPath || path.join(launcherDirectory, `${entry.id}.sh`);
	await fs.unlink(launcherPath).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "ENOENT") {
			throw error;
		}
	});

	await removeStateFiles(entry.id, stateDirectory);
}

export function launchScriptPathForEntry(
	entry: ManagedDesktopEntry,
	launcherDirectory: string,
): string {
	return (
		entry.launcherScriptPath || path.join(launcherDirectory, `${entry.id}.sh`)
	);
}

function normalizeUrl(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) {
		throw new Error("URL is required.");
	}
	const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	const parsed = new URL(withScheme);
	if (!parsed.hostname) {
		throw new Error("URL must include a valid host.");
	}
	return parsed.toString();
}

function slugifyName(input: string): string {
	const normalized = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "");
	return normalized || "web-app";
}

async function getUniqueDesktopFileName(
	directory: string,
	slug: string,
): Promise<string> {
	const base = `vicinae-${slug}`;
	for (let index = 1; index < 5000; index += 1) {
		const suffix = index === 1 ? "" : `-${index}`;
		const candidate = `${base}${suffix}.desktop`;
		try {
			await fs.access(path.join(directory, candidate), fsConstants.F_OK);
		} catch {
			return candidate;
		}
	}
	throw new Error("Could not allocate a unique desktop file name.");
}

function buildLaunchCommandTokens(
	browserCommand: string,
	argsTemplate: string,
	url: string,
): string[] {
	const urlData = new URL(url);
	const interpolatedArgs = argsTemplate
		.replaceAll("{url}", url)
		.replaceAll("{origin}", urlData.origin)
		.replaceAll("{hostname}", urlData.hostname);

	const commandTokens = splitCommandLine(browserCommand);
	if (commandTokens.length === 0) {
		throw new Error("Browser command is invalid.");
	}

	const argTokens = splitCommandLine(interpolatedArgs);
	return [...commandTokens, ...argTokens];
}

function splitCommandLine(input: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: "single" | "double" | null = null;
	let escaped = false;

	for (const char of input.trim()) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === "\\" && quote !== "single") {
			escaped = true;
			continue;
		}

		if (quote === "single") {
			if (char === "'") {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}

		if (quote === "double") {
			if (char === '"') {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}

		if (char === "'") {
			quote = "single";
			continue;
		}

		if (char === '"') {
			quote = "double";
			continue;
		}

		if (/\s/.test(char)) {
			if (current.length > 0) {
				args.push(current);
				current = "";
			}
			continue;
		}

		current += char;
	}

	if (escaped) {
		current += "\\";
	}

	if (quote !== null) {
		throw new Error("Unclosed quote in command or args template.");
	}

	if (current.length > 0) {
		args.push(current);
	}

	return args;
}

function quoteExecToken(token: string): string {
	const escapedPercent = token.replace(/%/g, "%%");
	const escaped = escapedPercent
		.replace(/\\/g, "\\\\")
		.replace(/\$/g, "\\$")
		.replace(/`/g, "\\`")
		.replace(/"/g, '\\"');

	if (escaped.length === 0) {
		return '""';
	}

	return /\s/.test(escaped) ? `"${escaped}"` : escaped;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function writeLauncherScript(options: {
	launcherScriptPath: string;
	launchTokens: string[];
	singleWindow: boolean;
	windowMatchMode: WindowMatchMode;
	windowManager: WindowManager;
	customFocusCommandTemplate: string;
	statePrefix: string;
}): Promise<void> {
	const launchTokens = options.launchTokens
		.map((token) => shellQuote(token))
		.join(" ");
	const content = `#!/usr/bin/env bash
set -u

SINGLE_WINDOW=${options.singleWindow ? "1" : "0"}
FORCE_SINGLE_WINDOW="\${VICINAE_FORCE_SINGLE_WINDOW:-0}"
WINDOW_MANAGER=${shellQuote(options.windowManager)}
MATCH_MODE=${shellQuote(options.windowMatchMode)}
CUSTOM_FOCUS_COMMAND_TEMPLATE=${shellQuote(options.customFocusCommandTemplate)}
STATE_PREFIX=${shellQuote(options.statePrefix)}

state_file_for_mode() {
  printf '%s.%s' "$STATE_PREFIX" "$MATCH_MODE"
}

load_match_value() {
  local state_file
  state_file="$(state_file_for_mode)"
  [ -s "$state_file" ] || return 1
  MATCH_VALUE="$(cat "$state_file" 2>/dev/null || true)"
  [ -n "$MATCH_VALUE" ]
}

save_match_value() {
  local value="$1"
  [ -n "$value" ] || return 1
  mkdir -p "$(dirname "$STATE_PREFIX")"
  printf '%s' "$value" > "$(state_file_for_mode)"
}

launch_app() {
  nohup ${launchTokens} >/dev/null 2>&1 &
}

should_use_single_window() {
  [ "$SINGLE_WINDOW" = "1" ] || [ "$FORCE_SINGLE_WINDOW" = "1" ]
}

focus_niri() {
  command -v niri >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1

  local windows_json
  windows_json="$(niri msg -j windows 2>/dev/null || niri msg --json windows 2>/dev/null)" || return 1

  local win_id
  win_id="$(printf '%s\n' "$windows_json" | jq -r --arg mode "$MATCH_MODE" --arg needle "$MATCH_VALUE" '
    def appid: (.app_id // "");
    def classv: (.class // .app_id // "");
    def titlev: (.title // .name // "");
    def anyv: ([appid, classv, titlev] | join(" "));
    def down($v): ($v | ascii_downcase);
    def hit:
      if $mode == "app-id" then down(appid) | contains(down($needle))
      elif $mode == "class" then down(classv) | contains(down($needle))
      elif $mode == "title" then down(titlev) | contains(down($needle))
      else down(anyv) | contains(down($needle))
      end;
    map(select(hit)) | .[0].id // empty
  ' | head -n1)"

  [ -n "$win_id" ] || return 1
  niri msg action focus-window --id "$win_id" >/dev/null 2>&1
}

capture_before_niri() {
  command -v niri >/dev/null 2>&1 || {
    echo "[]"
    return 0
  }
  command -v jq >/dev/null 2>&1 || {
    echo "[]"
    return 0
  }

  local windows_json
  windows_json="$(niri msg -j windows 2>/dev/null || niri msg --json windows 2>/dev/null)" || {
    echo "[]"
    return 0
  }

  printf '%s\n' "$windows_json" | jq -c 'map((.id | tostring))' 2>/dev/null || echo "[]"
}

wait_detect_niri() {
  command -v niri >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1
  local before_ids="$1"
  local attempts=40

  while [ "$attempts" -gt 0 ]; do
    local windows_json
    windows_json="$(niri msg -j windows 2>/dev/null || niri msg --json windows 2>/dev/null)" || {
      attempts=$((attempts - 1))
      sleep 0.2
      continue
    }

    local detected
    detected="$(printf '%s\n' "$windows_json" | jq -r --arg mode "$MATCH_MODE" --argjson before "$before_ids" '
      def appid: (.app_id // "");
      def classv: (.class // .app_id // "");
      def titlev: (.title // .name // "");
      def anyv: (([appid, classv, titlev] | map(select(length > 0))) | .[0] // "");
      def val:
        if $mode == "app-id" then appid
        elif $mode == "class" then classv
        elif $mode == "title" then titlev
        else anyv
        end;
      [
        .[]
        | select(((.id | tostring) as $id | ($before | index($id) | not)))
        | val
        | select(length > 0)
      ]
      | .[0] // empty
    ' | head -n1)"

    if [ -n "$detected" ]; then
      printf '%s' "$detected"
      return 0
    fi

    attempts=$((attempts - 1))
    sleep 0.2
  done

  return 1
}

focus_hyprland() {
  command -v hyprctl >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1

  local win_addr
  win_addr="$(hyprctl -j clients 2>/dev/null | jq -r --arg mode "$MATCH_MODE" --arg needle "$MATCH_VALUE" '
    def appid: (.class // .initialClass // "");
    def classv: (.class // .initialClass // "");
    def titlev: (.title // "");
    def anyv: ([appid, classv, titlev] | join(" "));
    def down($v): ($v | ascii_downcase);
    def hit:
      if $mode == "app-id" then down(appid) | contains(down($needle))
      elif $mode == "class" then down(classv) | contains(down($needle))
      elif $mode == "title" then down(titlev) | contains(down($needle))
      else down(anyv) | contains(down($needle))
      end;
    map(select(hit)) | .[0].address // empty
  ' | head -n1)"

  [ -n "$win_addr" ] || return 1
  hyprctl dispatch focuswindow "address:$win_addr" >/dev/null 2>&1
}

capture_before_hyprland() {
  command -v hyprctl >/dev/null 2>&1 || {
    echo "[]"
    return 0
  }
  command -v jq >/dev/null 2>&1 || {
    echo "[]"
    return 0
  }

  hyprctl -j clients 2>/dev/null | jq -c 'map((.address // "") | tostring)' 2>/dev/null || echo "[]"
}

wait_detect_hyprland() {
  command -v hyprctl >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1
  local before_ids="$1"
  local attempts=40

  while [ "$attempts" -gt 0 ]; do
    local detected
    detected="$(hyprctl -j clients 2>/dev/null | jq -r --arg mode "$MATCH_MODE" --argjson before "$before_ids" '
      def appid: (.class // .initialClass // "");
      def classv: (.class // .initialClass // "");
      def titlev: (.title // "");
      def anyv: (([appid, classv, titlev] | map(select(length > 0))) | .[0] // "");
      def val:
        if $mode == "app-id" then appid
        elif $mode == "class" then classv
        elif $mode == "title" then titlev
        else anyv
        end;
      [
        .[]
        | select((((.address // "") | tostring) as $id | ($before | index($id) | not)))
        | val
        | select(length > 0)
      ]
      | .[0] // empty
    ' | head -n1)"

    if [ -n "$detected" ]; then
      printf '%s' "$detected"
      return 0
    fi

    attempts=$((attempts - 1))
    sleep 0.2
  done

  return 1
}

focus_i3_like() {
  local wm_bin="$1"
  command -v "$wm_bin" >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1

  local con_id
  con_id="$($wm_bin -t get_tree 2>/dev/null | jq -r --arg mode "$MATCH_MODE" --arg needle "$MATCH_VALUE" '
    def appid: (.app_id // .window_properties.class // .window_properties.instance // "");
    def classv: (.window_properties.class // .window_properties.instance // .app_id // "");
    def titlev: (.name // "");
    def anyv: ([appid, classv, titlev] | join(" "));
    def down($v): ($v | ascii_downcase);
    def hit:
      if $mode == "app-id" then down(appid) | contains(down($needle))
      elif $mode == "class" then down(classv) | contains(down($needle))
      elif $mode == "title" then down(titlev) | contains(down($needle))
      else down(anyv) | contains(down($needle))
      end;
    [
      recurse(.nodes[]?, .floating_nodes[]?)
      | select(has("id"))
      | select(hit)
      | .id
    ]
    | .[0] // empty
  ' | head -n1)"

  [ -n "$con_id" ] || return 1
  "$wm_bin" "[con_id=$con_id] focus" >/dev/null 2>&1
}

capture_before_i3_like() {
  local wm_bin="$1"
  command -v "$wm_bin" >/dev/null 2>&1 || {
    echo "[]"
    return 0
  }
  command -v jq >/dev/null 2>&1 || {
    echo "[]"
    return 0
  }

  "$wm_bin" -t get_tree 2>/dev/null | jq -c '
    [
      recurse(.nodes[]?, .floating_nodes[]?)
      | select(has("id"))
      | (.id | tostring)
    ]
  ' 2>/dev/null || echo "[]"
}

wait_detect_i3_like() {
  local wm_bin="$1"
  command -v "$wm_bin" >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1
  local before_ids="$2"
  local attempts=40

  while [ "$attempts" -gt 0 ]; do
    local detected
    detected="$($wm_bin -t get_tree 2>/dev/null | jq -r --arg mode "$MATCH_MODE" --argjson before "$before_ids" '
      def appid: (.app_id // .window_properties.class // .window_properties.instance // "");
      def classv: (.window_properties.class // .window_properties.instance // .app_id // "");
      def titlev: (.name // "");
      def anyv: (([appid, classv, titlev] | map(select(length > 0))) | .[0] // "");
      def val:
        if $mode == "app-id" then appid
        elif $mode == "class" then classv
        elif $mode == "title" then titlev
        else anyv
        end;
      [
        recurse(.nodes[]?, .floating_nodes[]?)
        | select(has("id"))
        | select(((.id | tostring) as $id | ($before | index($id) | not)))
        | val
        | select(length > 0)
      ]
      | .[0] // empty
    ' | head -n1)"

    if [ -n "$detected" ]; then
      printf '%s' "$detected"
      return 0
    fi

    attempts=$((attempts - 1))
    sleep 0.2
  done

  return 1
}

focus_custom() {
  [ -n "$CUSTOM_FOCUS_COMMAND_TEMPLATE" ] || return 1
  [ -n "$MATCH_VALUE" ] || return 1
  local command_to_run="$CUSTOM_FOCUS_COMMAND_TEMPLATE"
  command_to_run="\${command_to_run//\{match\}/$MATCH_VALUE}"
  command_to_run="\${command_to_run//\{mode\}/$MATCH_MODE}"
  sh -c "$command_to_run" >/dev/null 2>&1
}

try_focus_existing() {
  should_use_single_window || return 1
  [ -n "$MATCH_VALUE" ] || return 1

  case "$WINDOW_MANAGER" in
    niri)
      focus_niri
      ;;
    hyprland)
      focus_hyprland
      ;;
    sway)
      focus_i3_like swaymsg
      ;;
    i3)
      focus_i3_like i3-msg
      ;;
    custom)
      focus_custom
      ;;
    *)
      return 1
      ;;
  esac
}

capture_before_ids() {
  case "$WINDOW_MANAGER" in
    niri)
      capture_before_niri
      ;;
    hyprland)
      capture_before_hyprland
      ;;
    sway)
      capture_before_i3_like swaymsg
      ;;
    i3)
      capture_before_i3_like i3-msg
      ;;
    *)
      echo "[]"
      ;;
  esac
}

wait_detect_value() {
  local before_ids="$1"
  case "$WINDOW_MANAGER" in
    niri)
      wait_detect_niri "$before_ids"
      ;;
    hyprland)
      wait_detect_hyprland "$before_ids"
      ;;
    sway)
      wait_detect_i3_like swaymsg "$before_ids"
      ;;
    i3)
      wait_detect_i3_like i3-msg "$before_ids"
      ;;
    *)
      return 1
      ;;
  esac
}

if should_use_single_window; then
  MATCH_VALUE=""
  if load_match_value; then
    if try_focus_existing; then
      exit 0
    fi
  fi

  BEFORE_IDS="$(capture_before_ids)"
  launch_app

  DETECTED_VALUE="$(wait_detect_value "$BEFORE_IDS" || true)"
  if [ -n "$DETECTED_VALUE" ]; then
    save_match_value "$DETECTED_VALUE" || true
  fi

  exit 0
fi

launch_app
`;

	await fs.writeFile(options.launcherScriptPath, content, "utf8");
	await fs.chmod(options.launcherScriptPath, 0o755);
}

function sanitizeDesktopValue(value: string): string {
	return value.replace(/[\r\n]+/g, " ").trim();
}

function parseDesktopBoolean(
	value: string | undefined,
	fallback: boolean,
): boolean {
	if (!value) {
		return fallback;
	}
	if (value.toLowerCase() === "true") {
		return true;
	}
	if (value.toLowerCase() === "false") {
		return false;
	}
	return fallback;
}

async function parseManagedEntry(
	filePath: string,
): Promise<ManagedDesktopEntry | undefined> {
	const content = await fs.readFile(filePath, "utf8");
	const data = parseDesktopEntry(content);
	if (data[MANAGED_MARKER_KEY] !== MANAGED_MARKER_VALUE) {
		return undefined;
	}

	const stats = await fs.stat(filePath).catch(() => undefined);
	const name = data.Name?.trim();
	const url = data[MANAGED_URL_KEY]?.trim();
	if (!name || !url) {
		return undefined;
	}

	return {
		id: data[MANAGED_ID_KEY]?.trim() || path.basename(filePath, ".desktop"),
		name,
		url,
		comment: data.Comment?.trim() || undefined,
		shortcut: data[MANAGED_SHORTCUT_KEY]?.trim() || undefined,
		browserCommand:
			data[MANAGED_COMMAND_KEY]?.trim() || DEFAULT_BROWSER_COMMAND,
		browserArgsTemplate:
			data[MANAGED_ARGS_KEY]?.trim() || DEFAULT_BROWSER_ARGS_TEMPLATE,
		singleWindow: parseDesktopBoolean(data[MANAGED_SINGLE_WINDOW_KEY], false),
		windowMatchMode: parseWindowMatchMode(data[MANAGED_MATCH_MODE_KEY]),
		windowMatchValue: data[MANAGED_MATCH_VALUE_KEY]?.trim() || undefined,
		windowManager: parseWindowManager(data[MANAGED_WM_KEY]),
		customFocusCommandTemplate:
			data[MANAGED_CUSTOM_FOCUS_KEY]?.trim() || undefined,
		desktopFilePath: filePath,
		desktopFileName: path.basename(filePath),
		launcherScriptPath: data[MANAGED_LAUNCHER_KEY]?.trim() || undefined,
		icon: data.Icon?.trim() || undefined,
		updatedAt: stats?.mtime,
	};
}

function parseDesktopEntry(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	let inDesktopEntrySection = false;

	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
			continue;
		}

		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			inDesktopEntrySection = trimmed === "[Desktop Entry]";
			continue;
		}

		if (!inDesktopEntrySection) {
			continue;
		}

		const separatorIndex = line.indexOf("=");
		if (separatorIndex <= 0) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (key) {
			result[key] = value;
		}
	}

	return result;
}

async function downloadFavicon(
	url: string,
	id: string,
	iconDirectory: string,
): Promise<string | undefined> {
	const pageUrl = new URL(url);
	const faviconUrl = getDuckDuckGoFaviconUrl(pageUrl.hostname);
	if (!faviconUrl) {
		return undefined;
	}

	try {
		const response = await fetchWithTimeout(faviconUrl, 7000);
		if (!response.ok) {
			return undefined;
		}

		const contentType = response.headers.get("content-type") || "";
		if (!contentType.startsWith("image/")) {
			return undefined;
		}

		const iconBytes = Buffer.from(await response.arrayBuffer());
		if (iconBytes.length === 0) {
			return undefined;
		}

		const preparedIcon = await prepareDownloadedIcon(
			iconBytes,
			contentType,
			faviconUrl,
		);
		await removeOldIcons(id, iconDirectory);
		const outputPath = path.join(
			iconDirectory,
			`${id}.${preparedIcon.extension}`,
		);
		await fs.writeFile(outputPath, preparedIcon.bytes);
		return outputPath;
	} catch {
		// best effort, keep the existing icon or fall back to the browser icon
	}

	return undefined;
}

function getDuckDuckGoFaviconUrl(domain: string): string | undefined {
	const normalizedDomain = domain.trim();
	if (!normalizedDomain) {
		return undefined;
	}

	return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(normalizedDomain)}.ico`;
}

async function prepareDownloadedIcon(
	iconBytes: Buffer,
	contentType: string,
	faviconUrl: string,
): Promise<{ bytes: Buffer; extension: string }> {
	const extension = detectIconExtension(contentType, faviconUrl);
	if (extension !== "webp") {
		return { bytes: iconBytes, extension };
	}

	const convertedBytes = convertWebpToPng(iconBytes);
	return convertedBytes
		? { bytes: convertedBytes, extension: "png" }
		: { bytes: iconBytes, extension };
}

function convertWebpToPng(iconBytes: Buffer): Buffer | undefined {
	try {
		const decodedIcon = decodeWebp(iconBytes);
		return Buffer.from(
			encodePng({
				width: decodedIcon.width,
				height: decodedIcon.height,
				data: decodedIcon.data,
				channels: 4,
				depth: 8,
			}),
		);
	} catch {
		// keep the original WebP when conversion fails
	}

	return undefined;
}

async function removeOldIcons(
	id: string,
	iconDirectory: string,
): Promise<void> {
	await fs.mkdir(iconDirectory, { recursive: true });
	const files = await fs.readdir(iconDirectory).catch(() => [] as string[]);
	await Promise.all(
		files
			.filter((file) => file.startsWith(`${id}.`))
			.map((file) =>
				fs.unlink(path.join(iconDirectory, file)).catch(() => undefined),
			),
	);
}

async function removeStateFiles(
	id: string,
	stateDirectory: string,
): Promise<void> {
	await fs.mkdir(stateDirectory, { recursive: true });
	const files = await fs.readdir(stateDirectory).catch(() => [] as string[]);
	await Promise.all(
		files
			.filter((file) => file === id || file.startsWith(`${id}.`))
			.map((file) =>
				fs.unlink(path.join(stateDirectory, file)).catch(() => undefined),
			),
	);
}

function detectIconExtension(
	contentType: string,
	candidateUrl: string,
): string {
	const normalizedContentType = contentType.split(";")[0].trim().toLowerCase();
	const byType: Record<string, string> = {
		"image/png": "png",
		"image/jpeg": "jpg",
		"image/jpg": "jpg",
		"image/gif": "gif",
		"image/svg+xml": "svg",
		"image/webp": "webp",
		"image/x-icon": "ico",
		"image/vnd.microsoft.icon": "ico",
	};
	if (byType[normalizedContentType]) {
		return byType[normalizedContentType];
	}

	try {
		const parsed = new URL(candidateUrl);
		const extension = path
			.extname(parsed.pathname)
			.toLowerCase()
			.replace(".", "");
		if (extension) {
			return extension;
		}
	} catch {
		// ignore
	}

	return "ico";
}

async function fetchWithTimeout(
	url: string,
	timeoutMs: number,
	init?: RequestInit,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			...init,
			signal: controller.signal,
			redirect: "follow",
		});
	} finally {
		clearTimeout(timeout);
	}
}

export function hostnameFromUrl(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}
