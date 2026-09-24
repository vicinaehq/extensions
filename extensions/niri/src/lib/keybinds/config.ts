import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { parseKdl } from './kdl';
import type { KdlNode, KdlValue } from './kdl';
import type { Keybind } from '../types';

const SYSTEM_CONFIG_PATH = '/etc/niri/config.kdl';

export interface ConfigFile {
  path: string;
  nodes: KdlNode[];
}

export function getNiriConfigPath(): string {
  const explicit = process.env['NIRI_CONFIG'];
  if (explicit) return explicit;

  const base = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
  return join(base, 'niri', 'config.kdl');
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

function resolveIncludePath(target: string, includedFrom: string): string {
  const expanded = expandHome(target);
  return isAbsolute(expanded) ? expanded : resolve(dirname(includedFrom), expanded);
}

async function readConfigTree(path: string, seen: Set<string>, files: ConfigFile[]) {
  const absolute = resolve(path);
  if (seen.has(absolute)) return;
  seen.add(absolute);

  const nodes = parseKdl(await readFile(absolute, 'utf8'));
  files.push({ path: absolute, nodes });

  for (const node of nodes) {
    if (node.name !== 'include') continue;

    const target = node.args[0];
    if (typeof target !== 'string') continue;

    try {
      await readConfigTree(resolveIncludePath(target, absolute), seen, files);
    } catch {
      // An include niri cannot read is niri's to report: listing the binds we
      // did read beats refusing to list any.
    }
  }
}

export async function loadNiriConfig(): Promise<ConfigFile[]> {
  const files: ConfigFile[] = [];
  const seen = new Set<string>();

  try {
    await readConfigTree(getNiriConfigPath(), seen, files);
    return files;
  } catch (error) {
    try {
      await readConfigTree(SYSTEM_CONFIG_PATH, seen, files);
      return files;
    } catch {
      throw error;
    }
  }
}

function formatValue(value: KdlValue): string {
  return value === null ? 'null' : String(value);
}

function formatActionArgs(action: KdlNode): string[] {
  const args = action.args.map(formatValue);
  const props = Object.entries(action.props).map(
    ([name, value]) => `${name}=${formatValue(value)}`
  );
  return [...args, ...props];
}

function toKeybind(node: KdlNode, source: string): Keybind {
  const parts = node.name.split('+');
  const action = node.children[0];
  const overlayTitle = node.props['hotkey-overlay-title'];
  const cooldownMs = node.props['cooldown-ms'];

  return {
    combo: node.name,
    modifiers: parts.slice(0, -1),
    key: parts[parts.length - 1] ?? node.name,
    action: action?.name ?? '',
    args: action ? formatActionArgs(action) : [],
    overlayTitle: typeof overlayTitle === 'string' ? overlayTitle : null,
    hiddenFromOverlay: overlayTitle === null,
    repeat: node.props['repeat'] !== false,
    cooldownMs: typeof cooldownMs === 'number' ? cooldownMs : null,
    allowWhenLocked: node.props['allow-when-locked'] === true,
    allowInhibiting: node.props['allow-inhibiting'] !== false,
    source,
    line: node.line,
    text: node.text,
  };
}

export function collectKeybinds(files: ConfigFile[]): Keybind[] {
  const keybinds: Keybind[] = [];

  for (const file of files) {
    for (const node of file.nodes) {
      if (node.name !== 'binds') continue;
      for (const bind of node.children) {
        keybinds.push(toKeybind(bind, file.path));
      }
    }
  }

  return keybinds;
}
