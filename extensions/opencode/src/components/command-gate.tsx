import { List } from "@vicinae/api";
import { useMemo, type ReactNode } from "react";
import { loadConfig, type Config } from "../lib/config";
import { useConnection } from "../lib/connection";
import type { Endpoint } from "../lib/opencode/discovery";
import { OpenCodeErrorView } from "./error-state";

export type CommandContext =
  | { readonly ready: true; readonly config: Config; readonly endpoint: Endpoint }
  | { readonly ready: false; readonly view: ReactNode };

/**
 * Connection gate shared by every command entrypoint: resolves config and
 * endpoint once per command window and renders the error view or loading list
 * until ready.
 */
export function useOpenCodeCommand(): CommandContext {
  const config = useMemo(() => loadConfig(), []);
  const connection = useConnection(config);

  if (connection.error) {
    return {
      ready: false,
      view: <OpenCodeErrorView error={connection.error} config={config} onRetry={connection.retry} />,
    };
  }
  if (!connection.endpoint) {
    return { ready: false, view: <List isLoading navigationTitle="OpenCode" /> };
  }
  return { ready: true, config, endpoint: connection.endpoint };
}
