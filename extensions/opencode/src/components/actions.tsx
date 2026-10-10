import { Action, ActionPanel, Alert, Keyboard, List, Toast, confirmAlert, showToast } from "@vicinae/api";
import type { ReactNode } from "react";
import { mapOpenCodeError, type OpenCodeError } from "../lib/opencode/errors";
import type { Config } from "../lib/config";
import { openSessionInTUI, openTUI, openTerminalAt, resolveOpenCodeBinary } from "../lib/launch";

/** Show a failure toast for any error thrown by an action. */
export async function showActionError(error: unknown, fallbackTitle: string): Promise<void> {
  const mapped: OpenCodeError = mapOpenCodeError(error);
  await showToast({ style: Toast.Style.Failure, title: fallbackTitle, message: mapped.message });
}

/** Open the OpenCode TUI resumed at a session. */
export function OpenSessionAction(props: {
  readonly sessionID: string;
  readonly directory?: string | undefined;
  readonly config: Config;
  readonly title?: string | undefined;
  readonly shortcut?: Keyboard.Shortcut | Keyboard.Shortcut.Common | undefined;
}): ReactNode {
  return (
    <Action
      title={props.title ?? "Resume in Terminal"}
      icon="terminal"
      {...(props.shortcut ? { shortcut: props.shortcut } : {})}
      onAction={() => {
        void (async () => {
          try {
            const binary = await resolveOpenCodeBinary(props.config.openCodePath);
            await openSessionInTUI(binary, props.sessionID, props.directory);
          } catch (error) {
            await showActionError(error, "Failed to open OpenCode");
          }
        })();
      }}
    />
  );
}

/** Open the OpenCode TUI in a directory. */
export function OpenTUIAction(props: { readonly directory?: string | undefined; readonly config: Config }): ReactNode {
  return (
    <Action
      title="Open in Terminal"
      icon="terminal"
      shortcut={{ modifiers: ["cmd"], key: "t" }}
      onAction={() => {
        void (async () => {
          try {
            const binary = await resolveOpenCodeBinary(props.config.openCodePath);
            await openTUI(binary, props.directory);
          } catch (error) {
            await showActionError(error, "Failed to open OpenCode");
          }
        })();
      }}
    />
  );
}

/** Open a directory in the file browser. */
export function OpenDirectoryAction(props: { readonly directory: string }): ReactNode {
  return (
    <Action.Open
      title="Open Directory"
      icon="folder"
      shortcut={{ modifiers: ["cmd"], key: "d" }}
      target={props.directory}
    />
  );
}

/** Open a bare shell at a directory (no OpenCode TUI). */
export function OpenTerminalAction(props: { readonly directory: string }): ReactNode {
  return (
    <Action
      title="Open Shell"
      icon="terminal"
      shortcut={{ modifiers: ["opt"], key: "t" }}
      onAction={() => {
        void openTerminalAt(props.directory).catch(() => showActionError(new Error("No terminal available."), "Failed to open terminal"));
      }}
    />
  );
}

/** Success view shown after a prompt was sent: offer to open the session in OpenCode. */
export function SentView(props: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly sessionID: string;
  readonly directory?: string | undefined;
  readonly config: Config;
  readonly againTitle?: string | undefined;
  readonly onAgain?: (() => void) | undefined;
}): ReactNode {
  return (
    <List navigationTitle="Prompt Sent" searchBarPlaceholder="Search">
      <List.EmptyView
        icon="speech-bubble"
        title={props.title}
        description={props.description ?? ""}
        actions={
          <ActionPanel>
            <OpenSessionAction
              sessionID={props.sessionID}
              directory={props.directory}
              config={props.config}
            />
            {props.onAgain ? (
              <Action title={props.againTitle ?? "New Session"} icon="rotate-clockwise" onAction={props.onAgain} />
            ) : null}
          </ActionPanel>
        }
      />
    </List>
  );
}

/** Delete a session after an explicit confirmation. */
export function DeleteSessionAction(props: {
  readonly sessionID: string;
  readonly sessionTitle: string;
  readonly onDelete: () => Promise<void>;
}): ReactNode {
  return (
    <Action
      title="Delete Session"
      icon="trash"
      style="destructive"
      shortcut="remove"
      onAction={() => {
        void (async () => {
          const confirmed = await confirmAlert({
            title: `Delete "${props.sessionTitle}"?`,
            message: "The session and its child sessions are permanently deleted.",
            primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
          });
          if (!confirmed) return;
          try {
            await props.onDelete();
            await showToast({ style: Toast.Style.Success, title: "Session deleted" });
          } catch (error) {
            await showActionError(error, "Failed to delete session");
          }
        })();
      }}
    />
  );
}
