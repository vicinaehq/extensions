import { Action, ActionPanel, Detail, useNavigation } from "@vicinae/api";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import type { Config } from "../lib/config";
import type { Endpoint } from "../lib/opencode/discovery";
import { OpenSessionAction } from "./actions";

export interface SharedConversation {
  readonly messages: ConversationMessage[];
  readonly sessionID?: string;
  readonly modelId?: string;
  readonly busy: boolean;
}

export interface ConversationMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "error";
  readonly text: string;
  readonly time: number;
  readonly streaming?: boolean;
}

/** Chat-style markdown in natural reading order: oldest at top, newest at bottom. */
export function conversationMarkdown(messages: ConversationMessage[], busy: boolean): string {
  const blocks = messages.map((message) => {
    if (message.role === "error") {
      return `**Error**\n\n${message.text}`;
    }
    const author = message.role === "user" ? "**You**" : "**Assistant**";
    const text = message.text || (message.streaming ? "…" : "");
    const suffix = message.streaming ? " ⋯" : "";
    return `${author}${suffix}\n\n${text}`;
  });
  if (busy && messages[messages.length - 1]?.role !== "assistant") {
    blocks.push("**Assistant** ⋯\n\n…");
  }
  return blocks.join("\n\n---\n\n");
}

/**
 * Full conversation in natural reading order, rendered as chat-style markdown
 * with a metadata sidebar. Live-updates while the parent window streams by
 * re-reading the shared state ref.
 */
export function ConversationDetail(props: {
  readonly shared: RefObject<SharedConversation>;
  readonly config: Config;
  readonly endpoint: Endpoint;
  readonly onNewConversation: () => void;
}): ReactNode {
  const { pop } = useNavigation();
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 100);
    return () => clearInterval(timer);
  }, []);

  const state = props.shared.current;
  const lastResponse = [...state.messages].reverse().find((message) => message.role === "assistant" && message.text);

  return (
    <Detail
      markdown={conversationMarkdown(state.messages, state.busy)}
      navigationTitle="Conversation"
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Messages" text={String(state.messages.length)} />
          {state.modelId ? <Detail.Metadata.Label title="Model" text={state.modelId} /> : null}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Session" text={state.sessionID ?? "not started"} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action title="Ask Follow-Up" onAction={pop} />
          {lastResponse ? (
            <Action.CopyToClipboard
              title="Copy Last Response"
              shortcut="copy"
              content={lastResponse.text}
            />
          ) : null}
          {state.sessionID ? (
            <OpenSessionAction sessionID={state.sessionID} config={props.config} />
          ) : null}
          <Action
            title="New Conversation"
            icon="rotate-clockwise"
            shortcut="new"
            onAction={() => {
              props.onNewConversation();
            }}
          />
        </ActionPanel>
      }
    />
  );
}
