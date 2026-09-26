import { closeMainWindow, PopToRootType } from '@vicinae/api';
import type { HyprWorkspace, Layout } from '../types';
import {
  ensureHyprRuntimeAvailable,
  getHyprctlJson,
  handleError,
  runHyprctlCommand,
} from './hyprctl';

/**
 * Switches the active workspace to the requested layout.
 */
export async function switchToLayout(layout: Layout) {
  try {
    const activeWorkspace =
      await getHyprctlJson<HyprWorkspace>('activeworkspace');
    await runHyprctlCommand(getSwitchLayoutArgs(activeWorkspace.id, layout));
    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    return true;
  } catch (error) {
    handleError('Layout switch failed', error);
    return false;
  }
}

type HyprFocusTarget = 'window' | 'monitor' | 'workspace';

/**
 * Focuses a window, monitor, or workspace using the available Hyprland API.
 */
export async function focusHyprTarget(target: HyprFocusTarget, value: string) {
  try {
    await ensureHyprRuntimeAvailable();
    try {
      await runHyprctlCommand(getLegacyHyprFocusArgs(target, value));
    } catch {
      await runHyprctlCommand(getLuaHyprFocusArgs(target, value));
    }

    await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    return true;
  } catch (error) {
    handleError('Focus failed', error);
    return false;
  }
}

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
