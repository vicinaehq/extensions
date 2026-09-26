import { useRef, useState } from "react";
import type {
  SoftwareOperationOptions,
  SoftwareOperationProgress,
} from "../types.ts";

interface ActiveOperation {
  controller: AbortController;
  cancellable: boolean;
}

export function useSoftwareOperation() {
  const operations = useRef(new Map<string, ActiveOperation>());
  const [cancellableKeys, setCancellableKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const start = (
    key: string,
    onProgress: (progress: SoftwareOperationProgress) => void,
  ): SoftwareOperationOptions => {
    const controller = new AbortController();
    operations.current.set(key, { controller, cancellable: false });

    return {
      signal: controller.signal,
      onProgress: (progress) => {
        const active = operations.current.get(key);
        if (!active || active.controller !== controller) return;
        if (active.cancellable !== progress.cancellable) {
          active.cancellable = progress.cancellable;
          setCancellableKeys((current) =>
            withCancellableKey(current, key, progress.cancellable)
          );
        }
        onProgress(progress);
      },
    };
  };

  const finish = (key: string) => {
    const active = operations.current.get(key);
    if (!active) return;
    operations.current.delete(key);
    if (active.cancellable) {
      setCancellableKeys((current) => withCancellableKey(current, key, false));
    }
  };

  const cancel = (key: string) => {
    const active = operations.current.get(key);
    if (!active?.cancellable) return;
    active.cancellable = false;
    active.controller.abort();
    setCancellableKeys((current) => withCancellableKey(current, key, false));
  };

  const isCancellable = (key: string) => cancellableKeys.has(key);

  return { start, finish, cancel, isCancellable };
}

function withCancellableKey(
  current: ReadonlySet<string>,
  key: string,
  cancellable: boolean,
): ReadonlySet<string> {
  if (current.has(key) === cancellable) return current;
  const next = new Set(current);
  if (cancellable) next.add(key);
  else next.delete(key);
  return next;
}
