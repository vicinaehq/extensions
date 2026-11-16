import { LocalStorage } from "@vicinae/api";
import type { HiddenState } from "./visibility";

const HIDDEN_KEY = "hiddenGames";
const SHOWN_KEY = "shownGames";

async function loadSet(key: string): Promise<Set<string>> {
  const raw = await LocalStorage.getItem<string>(key);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export async function loadHiddenState(): Promise<HiddenState> {
  const [hidden, shown] = await Promise.all([loadSet(HIDDEN_KEY), loadSet(SHOWN_KEY)]);
  return { hidden, shown };
}

export async function saveHiddenState(state: HiddenState): Promise<void> {
  await Promise.all([
    LocalStorage.setItem(HIDDEN_KEY, JSON.stringify([...state.hidden].sort())),
    LocalStorage.setItem(SHOWN_KEY, JSON.stringify([...state.shown].sort())),
  ]);
}
