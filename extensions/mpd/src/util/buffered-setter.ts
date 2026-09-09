// Coalesces many (key, value) writes into a single state update.
//
// Background: when we stream art results into React state one-per-completed-URI,
// a thousand-album library produces a thousand setState calls in quick
// succession. Each setState forces a render of every <List.Item>, so the UI
// can stutter while art is loading. This helper buffers pushes for a short
// interval (default 150 ms) and flushes them as a single setState — turning
// ~1,000 renders into ~7.
//
// The shape is generic over the value type so the same helper could be used
// for any { key -> value } record-shaped state.

export type RecordSetState<T> = (
  updater: (prev: Record<string, T>) => Record<string, T>,
) => void;

export interface BufferedRecordSetter<T> {
  push(key: string, value: T | null): void;
  flush(): void;
  dispose(): void;
}

export interface BufferedSetterOptions {
  intervalMs?: number;
}

export function createBufferedRecordSetter<T>(
  setState: RecordSetState<T>,
  opts: BufferedSetterOptions = {},
): BufferedRecordSetter<T> {
  const intervalMs = opts.intervalMs ?? 150;
  let pending = new Map<string, T>();
  let timer: NodeJS.Timeout | null = null;

  function commit(): void {
    if (pending.size === 0) return;
    const entries = pending;
    pending = new Map();
    setState((prev) => {
      const next = { ...prev };
      for (const [k, v] of entries) {
        next[k] = v;
      }
      return next;
    });
  }

  return {
    push(key, value) {
      // null/undefined values are intentionally dropped — for the art use
      // case a null result means "no cover available" and shouldn't pollute
      // the record (the absence of a key already means no art).
      if (value === null || value === undefined) return;
      pending.set(key, value);
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          commit();
        }, intervalMs);
      }
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      commit();
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending.clear();
    },
  };
}
