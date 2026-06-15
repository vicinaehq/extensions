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
  Layout,
} from './types';

const execFileAsync = promisify(execFile);
const evdevHeaderPath = '/usr/include/linux/input-event-codes.h';
const xkbEvdevOffset = 8;
let evdevKeycodes: Record<number, string> | undefined;
let hyprctlCheckPromise: Promise<void> | undefined;

export function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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

export async function switchToLayout(
  activeWorkspaceId: number,
  layout: Layout
) {
  try {
    await ensureHyprRuntimeAvailable();
    const { stdout } = await execFileAsync(
      'hyprctl',
      getSwitchLayoutArgs(activeWorkspaceId, layout),
      {
        timeout: 10000,
      }
    ).catch((error: unknown) => {
      throw normalizeHyprError(error);
    });

    ensureHyprctlCommandSucceeded(stdout.toString());
    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    return true;
  } catch (error) {
    handleError('Layout switch failed', error);
    return false;
  }
}

export async function focusHyprTarget(target: HyprFocusTarget, value: string) {
  try {
    await ensureHyprRuntimeAvailable();
    await execFileAsync('hyprctl', [getHyprFocusCommand(target, value)], {
      timeout: 10000,
    }).catch((error: unknown) => {
      throw normalizeHyprError(error);
    });
    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    return true;
  } catch (error) {
    handleError('Focus failed', error);
    return false;
  }
}

export function handleError(title: string, error: unknown) {
  console.error(error);
  const normalizedError = normalizeHyprError(error);

  showToast({
    style: Toast.Style.Failure,
    title,
    message: normalizedError.message,
  });
}

async function ensureHyprRuntimeAvailable() {
  ensureHyprlandSession();
  await ensureHyprctlAvailable();
}

function ensureHyprlandSession() {
  if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
    return;
  }

  throw new Error('This extension only works in a Hyprland session.');
}

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

function isMissingHyprlandSessionError(message: string) {
  return /HYPRLAND_INSTANCE_SIGNATURE/u.test(message);
}

function isUnavailableHyprlandIpcError(message: string) {
  return /(instance signature|socket|ipc|connection|connect|broken pipe)/iu.test(
    message
  );
}

export function formatResolution(width?: number, height?: number) {
  if (width === undefined || height === undefined) {
    return 'Unknown';
  }

  return `${width}x${height}`;
}

export function formatRefreshRate(refreshRate?: number) {
  if (refreshRate === undefined) {
    return 'Unknown';
  }

  return `${refreshRate.toFixed(2)}Hz`;
}

export function formatRect(surface: HyprLayerSurface) {
  return `${surface.w}x${surface.h}+${surface.x}+${surface.y}`;
}

export function formatWorkspace(id: number, name: string) {
  return name || id.toString();
}

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

function getSwitchLayoutArgs(activeWorkspaceId: number, layout: Layout) {
  return [
    'eval',
    `hl.workspace_rule({ workspace = "${activeWorkspaceId}", layout = "${layout}" })`,
  ];
}

function ensureHyprctlCommandSucceeded(stdout: string) {
  const output = stdout.trim();

  if (output.startsWith('error:')) {
    throw new Error(output);
  }
}

function getHyprFocusCommand(target: HyprFocusTarget, value: string) {
  const luaValue = escapeLuaString(value);

  if (target === 'window') {
    return `[[BATCH]]dispatch focuswindow address:${value};eval hl.dispatch(hl.dsp.focus({window="address:${luaValue}"}))`;
  }

  if (target === 'monitor') {
    return `[[BATCH]]dispatch focusmonitor ${value};eval hl.dispatch(hl.dsp.focus({monitor="${luaValue}"}))`;
  }

  return `[[BATCH]]dispatch workspace ${value};eval hl.dispatch(hl.dsp.focus({workspace="${luaValue}"}))`;
}

function escapeLuaString(value: string) {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

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

function getBindKey(bind: HyprctlBind) {
  if (bind.key) {
    return bind.key;
  }

  if (bind.keycode) {
    return keycodeToKey(bind.keycode);
  }

  return '';
}

function formatBindDispatch(dispatcher: string, arg: string) {
  return arg ? `${dispatcher} ${arg}` : dispatcher;
}

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

function keycodeToKey(keycode: number) {
  const evdevCode = keycode - xkbEvdevOffset;

  return loadEvdevKeycodes()[evdevCode] ?? `code:${keycode}`;
}

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
