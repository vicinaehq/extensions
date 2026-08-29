import { LocalStorage } from "@vicinae/api";
import { useCallback, useEffect, useSyncExternalStore } from "react";

type Slot = {
  hydrated: boolean;
  value: unknown;
};

const slots = new Map<string, Slot>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Set<string>();

function getOrCreateSlot(key: string, initialValue: unknown): Slot {
  let slot = slots.get(key);
  if (!slot) {
    slot = { hydrated: false, value: initialValue };
    slots.set(key, slot);
  }
  return slot;
}

function emit(key: string) {
  const set = listeners.get(key);
  if (!set) {
    return;
  }

  for (const listener of set) {
    listener();
  }
}

function write(key: string, next: Slot) {
  slots.set(key, next);
  emit(key);
}

export function useCachedState<T>(key: string, initialValue: T): [T, (value: T) => void, boolean] {
  getOrCreateSlot(key, initialValue);

  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }

      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    [key],
  );

  const value = useSyncExternalStore(
    subscribe,
    () => getOrCreateSlot(key, initialValue).value as T,
    () => getOrCreateSlot(key, initialValue).value as T,
  );

  const isHydrated = useSyncExternalStore(
    subscribe,
    () => getOrCreateSlot(key, initialValue).hydrated,
    () => getOrCreateSlot(key, initialValue).hydrated,
  );

  useEffect(() => {
    if (getOrCreateSlot(key, initialValue).hydrated || loading.has(key)) {
      return;
    }

    loading.add(key);

    void LocalStorage.getItem(key).then((raw) => {
      loading.delete(key);
      const current = getOrCreateSlot(key, initialValue);

      if (raw !== undefined && raw !== null) {
        try {
          const parsed = typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
          if (!(parsed === undefined || (parsed === null && initialValue !== null))) {
            write(key, { hydrated: true, value: parsed });
            return;
          }
        } catch {
          // Keep the initial value when stored data is not valid JSON.
        }
      }

      write(key, { hydrated: true, value: current.value });
    });
  }, [key]);

  const setCachedState = useCallback(
    (next: T) => {
      write(key, { hydrated: true, value: next });
      void LocalStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );

  return [value, setCachedState, isHydrated];
}
