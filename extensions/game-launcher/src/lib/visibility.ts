import { sourceOfGameId } from "./games";

/**
 * Which games are hidden. Two sources are merged:
 *   - games hidden with this extension's own Hide action, and
 *   - games in the launcher's own hidden list (Steam's Hidden collection).
 *
 * We never write to Steam's data. Unhiding a Steam-hidden game here records a
 * "shown" override instead, so it reappears here but stays hidden in Steam.
 */

export interface HiddenState {
  /** Hidden with this extension. */
  hidden: ReadonlySet<string>;
  /** Hidden in the launcher, but explicitly shown here. */
  shown: ReadonlySet<string>;
}

export const emptyHiddenState = (): HiddenState => ({ hidden: new Set(), shown: new Set() });

export function isHidden(id: string, state: HiddenState, hiddenInLauncher: ReadonlySet<string>): boolean {
  return state.hidden.has(id) || (hiddenInLauncher.has(id) && !state.shown.has(id));
}

/** A merged entry (one game, several launchers) is hidden if any of its copies is. */
export function isAnyHidden(ids: readonly string[], state: HiddenState, hiddenInLauncher: ReadonlySet<string>): boolean {
  return ids.some((id) => isHidden(id, state, hiddenInLauncher));
}

export interface ToggleResult {
  state: HiddenState;
  nowHidden: boolean;
  /** Copies that were unhidden here but are still hidden in their own launcher. */
  stillHiddenInLauncher: string[];
}

/**
 * Hide or unhide one entry, given the ids of all its copies (preferred first). Both act on
 * every copy, so the entry behaves the same whichever launcher is preferred, and with
 * Merge Duplicates off each copy stays hidden or shown. Unhiding gives launcher-hidden copies
 * a "shown here" override; hiding drops those overrides (restoring the launcher's own choice)
 * and hides the other copies here.
 */
export function toggleHidden(copies: readonly string[], state: HiddenState, hiddenInLauncher: ReadonlySet<string>): ToggleResult {
  const hidden = new Set(state.hidden);
  const shown = new Set(state.shown);
  if (isAnyHidden(copies, state, hiddenInLauncher)) {
    const stillHiddenInLauncher: string[] = [];
    for (const id of copies) {
      hidden.delete(id);
      if (hiddenInLauncher.has(id)) {
        shown.add(id);
        stillHiddenInLauncher.push(id);
      }
    }
    return { state: { hidden, shown }, nowHidden: false, stillHiddenInLauncher };
  }
  for (const id of copies) {
    if (hiddenInLauncher.has(id)) shown.delete(id);
    else hidden.add(id);
  }
  return { state: { hidden, shown }, nowHidden: true, stillHiddenInLauncher: [] };
}

/**
 * Drop "shown" overrides for games the launcher no longer hides, so that if
 * the user hides them in the launcher again later, they're hidden here too.
 * Only overrides for launchers in `trusted` (whose hidden list was read
 * completely) are touched; a disabled or unreadable launcher keeps its overrides.
 * Returns undefined when nothing changed.
 */
export function pruneShown(
  state: HiddenState,
  hiddenInLauncher: ReadonlySet<string>,
  trusted: ReadonlySet<string>,
): HiddenState | undefined {
  const shown = new Set(
    [...state.shown].filter((id) => {
      const source = sourceOfGameId(id);
      return !source || !trusted.has(source) || hiddenInLauncher.has(id);
    }),
  );
  return shown.size === state.shown.size ? undefined : { hidden: state.hidden, shown };
}
