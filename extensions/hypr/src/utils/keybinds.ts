import { existsSync, readFileSync } from 'node:fs';
import type { HyprBind, HyprctlBind } from '../types';

const evdevHeaderPath = '/usr/include/linux/input-event-codes.h';
const xkbEvdevOffset = 8;
let evdevKeycodes: Record<number, string> | undefined;

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
