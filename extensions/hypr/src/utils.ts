import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { closeMainWindow, PopToRootType, showToast, Toast } from '@vicinae/api';
import type {
  FlatHyprLayerSurface,
  HyprBind,
  HyprctlBind,
  HyprLayerSurface,
  HyprLayersResponse,
  HyprWorkspace,
  Layout,
} from './types';

const execFileAsync = promisify(execFile);
const evdevHeaderPath = '/usr/include/linux/input-event-codes.h';
const xkbEvdevOffset = 8;
let evdevKeycodes: Record<number, string> | undefined;
let hyprctlCheckPromise: Promise<void> | undefined;

/**
 * Capitalizes the first character of a string.
 */
export function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Runs a hyprctl command and parses its JSON output.
 */
export async function getHyprctlJson<T>(command: string): Promise<T> {
  await ensureHyprRuntimeAvailable();
  const args = ['-j', ...command.split(' ').filter(Boolean)];
  const { stdout } = await execFileAsync('hyprctl', args, {
    timeout: 10000,
  }).catch((error: unknown) => {
    throw normalizeHyprError(error);
  });

  return JSON.parse(stdout) as T;
}

/**
 * Switches the active workspace to the requested layout.
 */
export async function switchToLayout(layout: Layout) {
  try {
    const activeWorkspace =
      await getHyprctlJson<HyprWorkspace>('activeworkspace');
    const { stdout } = await execFileAsync(
      'hyprctl',
      getSwitchLayoutArgs(activeWorkspace.id, layout),
      {
        timeout: 10000,
      }
    ).catch((error: unknown) => {
      throw normalizeHyprError(error);
    });

    ensureHyprctlCommandSucceeded(stdout);
    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    return true;
  } catch (error) {
    handleError('Layout switch failed', error);
    return false;
  }
}

/**
 * Focuses a window, monitor, or workspace using the available Hyprland API.
 */
export async function focusHyprTarget(target: HyprFocusTarget, value: string) {
  try {
    await ensureHyprRuntimeAvailable();
    try {
      await runHyprctlCommand(getLegacyHyprFocusArgs(target, value));
    } catch {
      await runHyprctlCommand(getLuaHyprFocusArgs(target, value)).catch(
        (error: unknown) => {
          throw normalizeHyprError(error);
        }
      );
    }

    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    return true;
  } catch (error) {
    handleError('Focus failed', error);
    return false;
  }
}

/**
 * Runs hyprctl with the given arguments and rejects textual command errors.
 */
async function runHyprctlCommand(args: string[]) {
  const { stdout } = await execFileAsync('hyprctl', args, {
    timeout: 10000,
  });

  ensureHyprctlCommandSucceeded(stdout);
}

/**
 * Logs an error and displays a normalized failure toast.
 */
export function handleError(title: string, error: unknown) {
  console.error(error);
  const normalizedError = normalizeHyprError(error);

  showToast({
    style: Toast.Style.Failure,
    title,
    message: normalizedError.message,
  });
}

/**
 * Verifies that the current environment can communicate with Hyprland.
 */
async function ensureHyprRuntimeAvailable() {
  ensureHyprlandSession();
  await ensureHyprctlAvailable();
}

/**
 * Throws when the extension is not running inside a Hyprland session.
 */
function ensureHyprlandSession() {
  if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
    return;
  }

  throw new Error('This extension only works in a Hyprland session.');
}

/**
 * Checks that the hyprctl executable and Hyprland IPC are available.
 */
async function ensureHyprctlAvailable() {
  hyprctlCheckPromise ??= execFileAsync('hyprctl', ['version'], {
    timeout: 10000,
  })
    .then(() => undefined)
    .catch((error: unknown) => {
      hyprctlCheckPromise = undefined;
      throw normalizeHyprError(error);
    });

  await hyprctlCheckPromise;
}

/**
 * Converts process and Hyprland errors into user-facing error messages.
 */
function normalizeHyprError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error('Unknown error');
  }

  const execError = error as Error & {
    code?: string | number;
    stdout?: string;
    stderr?: string;
  };
  const combinedOutput = [execError.message, execError.stderr, execError.stdout]
    .filter(Boolean)
    .join('\n');

  if (execError.code === 'ENOENT') {
    return new Error(
      'hyprctl is required. Install Hyprland/hyprctl and try again.'
    );
  }

  if (isMissingHyprlandSessionError(combinedOutput)) {
    return new Error('This extension only works in a Hyprland session.');
  }

  if (isUnavailableHyprlandIpcError(combinedOutput)) {
    return new Error(
      'Hyprland IPC is unavailable. Make sure Hyprland is running and try again.'
    );
  }

  return error;
}

/**
 * Detects errors caused by a missing Hyprland session environment variable.
 */
function isMissingHyprlandSessionError(message: string) {
  return /HYPRLAND_INSTANCE_SIGNATURE/u.test(message);
}

/**
 * Detects errors indicating that Hyprland IPC cannot be reached.
 */
function isUnavailableHyprlandIpcError(message: string) {
  return /(instance signature|socket|ipc|connection|connect|broken pipe)/iu.test(
    message
  );
}

/**
 * Formats optional dimensions as a resolution string.
 */
export function formatResolution(width?: number, height?: number) {
  if (width === undefined || height === undefined) {
    return 'Unknown';
  }

  return `${width}x${height}`;
}

/**
 * Formats an optional refresh rate with two decimal places.
 */
export function formatRefreshRate(refreshRate?: number) {
  if (refreshRate === undefined) {
    return 'Unknown';
  }

  return `${refreshRate.toFixed(2)}Hz`;
}

/**
 * Formats a layer surface rectangle as dimensions and coordinates.
 */
export function formatRect(surface: HyprLayerSurface) {
  return `${surface.w}x${surface.h}+${surface.x}+${surface.y}`;
}

/**
 * Displays a workspace name, falling back to its numeric identifier.
 */
export function formatWorkspace(id: number, name: string) {
  return name || id.toString();
}

/**
 * Flattens monitor-level layer data into a list of layer surfaces.
 */
export function flattenLayers(
  layers: HyprLayersResponse
): FlatHyprLayerSurface[] {
  return Object.entries(layers).flatMap(([monitor, monitorLayers]) =>
    Object.entries(monitorLayers.levels).flatMap(([level, surfaces]) =>
      surfaces.map((surface) => {
        const levelNumber = Number(level);

        return {
          ...surface,
          monitor,
          level: levelNumber,
          layer: getLayerName(levelNumber),
        };
      })
    )
  );
}

/**
 * Maps a numeric layer level to its Hyprland layer name.
 */
function getLayerName(level: number) {
  const layers: Record<number, string> = {
    0: 'background',
    1: 'bottom',
    2: 'top',
    3: 'overlay',
  };

  return layers[level] ?? `level ${level}`;
}

type HyprFocusTarget = 'window' | 'monitor' | 'workspace';

/**
 * Builds the hyprctl arguments for changing a workspace layout.
 */
function getSwitchLayoutArgs(activeWorkspaceId: number, layout: Layout) {
  return [
    'eval',
    `hl.workspace_rule({ workspace = "${activeWorkspaceId}", layout = "${layout}" })`,
  ];
}

/**
 * Throws when hyprctl reports an error in otherwise successful output.
 */
function ensureHyprctlCommandSucceeded(stdout: string) {
  const output = stdout.trim();

  if (output.startsWith('error:')) {
    throw new Error(output);
  }
}

/**
 * Builds legacy hyprctl dispatch arguments for focusing a target.
 */
function getLegacyHyprFocusArgs(target: HyprFocusTarget, value: string) {
  if (target === 'window') {
    return ['dispatch', 'focuswindow', `address:${value}`];
  }

  if (target === 'monitor') {
    return ['dispatch', 'focusmonitor', value];
  }

  return ['dispatch', 'workspace', value];
}

/**
 * Builds Lua-based hyprctl dispatch arguments for focusing a target.
 */
function getLuaHyprFocusArgs(target: HyprFocusTarget, value: string) {
  const luaValue = escapeLuaString(value);

  if (target === 'window') {
    return ['dispatch', `hl.dsp.focus({window="address:${luaValue}"})`];
  }

  if (target === 'monitor') {
    return ['dispatch', `hl.dsp.focus({monitor="${luaValue}"})`];
  }

  return ['dispatch', `hl.dsp.focus({workspace="${luaValue}"})`];
}

/**
 * Escapes backslashes and quotes for use inside a Lua string literal.
 */
function escapeLuaString(value: string) {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

/**
 * Converts raw Hyprland bindings into the display model used by the extension.
 */
export function mapHyprBinds(rawBinds: HyprctlBind[]): HyprBind[] {
  return rawBinds.map((bind) => {
    const rawKey = getBindKey(bind);
    let key = rawKey;

    if (bind.mouse) {
      key = mapMouseKey(key);
    }

    return {
      key: key || (bind.catch_all ? 'catch all' : '-'),
      modifiers: modmaskToString(bind.modmask),
      dispatch: formatBindDispatch(bind.dispatcher, bind.arg),
      dispatcher: bind.dispatcher,
      arg: bind.arg,
      description: bind.description || '',
      locked: bind.locked,
      mouse: bind.mouse,
      release: bind.release,
      repeat: bind.repeat,
      longPress: bind.longPress,
      nonConsuming: bind.non_consuming,
      autoConsuming: bind.auto_consuming ?? false,
      catchAll: bind.catch_all,
      submap: bind.submap,
    };
  });
}

/**
 * Gets a binding's named key or converts its numeric keycode.
 */
function getBindKey(bind: HyprctlBind) {
  if (bind.key) {
    return bind.key;
  }

  if (bind.keycode) {
    return keycodeToKey(bind.keycode);
  }

  return '';
}

/**
 * Combines a dispatcher and optional argument into display text.
 */
function formatBindDispatch(dispatcher: string, arg: string) {
  return arg ? `${dispatcher} ${arg}` : dispatcher;
}

/**
 * Loads and caches Linux evdev keycode names from the kernel header.
 */
function loadEvdevKeycodes(): Record<number, string> {
  if (evdevKeycodes) {
    return evdevKeycodes;
  }

  evdevKeycodes = {};

  if (!existsSync(evdevHeaderPath)) {
    return evdevKeycodes;
  }

  try {
    const header = readFileSync(evdevHeaderPath, 'utf8');

    for (const line of header.split('\n')) {
      const match = line.match(/^#define\s+KEY_([A-Z0-9_]+)\s+(\d+)/u);

      if (match) {
        const [, name, code] = match;
        evdevKeycodes[Number(code)] = name;
      }
    }
  } catch (error) {
    console.warn(`Failed to read ${evdevHeaderPath}:`, error);
  }

  return evdevKeycodes;
}

/**
 * Converts an XKB keycode to an evdev key name when available.
 */
function keycodeToKey(keycode: number) {
  const evdevCode = keycode - xkbEvdevOffset;

  return loadEvdevKeycodes()[evdevCode] ?? `code:${keycode}`;
}

/**
 * Converts Hyprland's modifier bitmask into readable modifier names.
 */
function modmaskToString(modmask: number) {
  const modifiers: string[] = [];

  if (modmask & 64) {
    modifiers.push('SUPER');
  }

  if (modmask & 4) {
    modifiers.push('CTRL');
  }

  if (modmask & 8) {
    modifiers.push('ALT');
  }

  if (modmask & 1) {
    modifiers.push('SHIFT');
  }

  return modifiers.join(' + ');
}

/**
 * Converts raw mouse binding names into readable labels.
 */
function mapMouseKey(key: string) {
  const normalizedKey = key.replace(/\s+/gu, '').toLowerCase();
  const mouseKeys: Record<string, string> = {
    'mouse:272': 'left click',
    'mouse:273': 'right click',
    'mouse:274': 'middle click',
    'mouse:wheelup': 'wheelup',
    'mouse:wheeldown': 'wheeldown',
    'mouse:wheelleft': 'wheelleft',
    'mouse:wheelright': 'wheelright',
  };

  return mouseKeys[normalizedKey] ?? key;
}
