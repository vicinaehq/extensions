import { useEffect, useState } from "react";
import { mapOpenCodeError, notRunningError, type OpenCodeError } from "./opencode/errors";
import { resolveEndpoint, type ConnectionConfig, type Endpoint } from "./opencode/discovery";

export interface Connection {
  readonly endpoint?: Endpoint;
  readonly error?: OpenCodeError;
  readonly retry: () => void;
}

/**
 * Resolve the OpenCode endpoint for the lifetime of a command window.
 * A null discovery result becomes the "OpenCode is not running" state.
 */
export function useConnection(config: ConnectionConfig): Connection {
  const [state, setState] = useState<{ endpoint?: Endpoint; error?: OpenCodeError }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    resolveEndpoint(config).then(
      (endpoint) => {
        if (cancelled) return;
        setState(endpoint ? { endpoint } : { error: notRunningError() });
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({ error: mapOpenCodeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [config, attempt]);

  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
