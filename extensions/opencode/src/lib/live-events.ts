import { useEffect, useRef } from "react";
import type { OpenCodeService } from "./opencode/client";

const EVENT_REFRESH_DEBOUNCE_MS = 1000;

/** Session lifecycle and user input events that should refresh a live view. */
const LIVE_EVENT_TYPES = new Set<string>([
  "session.created",
  "session.renamed",
  "session.deleted",
  "session.status",
  "session.idle",
  "session.permissions",
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "permission.asked",
  "permission.replied",
  "form.created",
  "form.replied",
  "form.cancelled",
]);

/**
 * Live refresh through the official event stream while a view is mounted.
 * Session lifecycle events trigger a debounced `refresh` call; other events
 * and stream failures are ignored.
 */
export function useLiveEvents(service: OpenCodeService, refresh: () => void): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of service.events(controller.signal)) {
          if (controller.signal.aborted) return;
          if (!LIVE_EVENT_TYPES.has(event.type)) continue;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            refresh();
          }, EVENT_REFRESH_DEBOUNCE_MS);
        }
      } catch {
        // Event stream failures are non-fatal; the view still works.
      }
    })();
    return () => {
      controller.abort();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [service, refresh]);
}
