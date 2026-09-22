import { Action, ActionPanel, List, Toast, showToast } from "@vicinae/api";
import { useState, type ReactNode } from "react";
import { errorHint, type OpenCodeError } from "../lib/opencode/errors";
import { startOpenCodeService } from "../lib/opencode/discovery";
import { resolveOpenCodeBinary } from "../lib/launch";
import type { Config } from "../lib/config";

/**
 * Shared error surface for every command: the not-running state (with a
 * Start OpenCode action) or a mapped OpenCode error.
 */
export function OpenCodeErrorView(props: {
  readonly error: OpenCodeError;
  readonly config: Config;
  readonly onRetry?: () => void;
}): ReactNode {
  const [starting, setStarting] = useState(false);
  const startable = props.error.kind === "unreachable";

  const start = async () => {
    setStarting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Starting OpenCode" });
    try {
      const binary = await resolveOpenCodeBinary(props.config.openCodePath);
      await startOpenCodeService(binary);
      await showToast({ style: Toast.Style.Success, title: "OpenCode started" });
      props.onRetry?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to start OpenCode.";
      await showToast({ style: Toast.Style.Failure, title: "Failed to start OpenCode", message });
    } finally {
      setStarting(false);
      void toast.hide();
    }
  };

  return (
    <List isLoading={starting} navigationTitle="OpenCode">
      <List.EmptyView
        title={props.error.message}
        description={errorHint(props.error)}
        actions={
          <ActionPanel>
            {startable ? (
              <Action title="Start OpenCode" onAction={() => void start()} />
            ) : null}
            {props.onRetry ? (
              <Action title="Retry" shortcut="refresh" onAction={props.onRetry} />
            ) : null}
          </ActionPanel>
        }
      />
    </List>
  );
}
