import { Action, ActionPanel, Detail, Toast, showToast } from "@vicinae/api";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createOpenCodeService } from "../lib/opencode/client";
import type { Endpoint } from "../lib/opencode/discovery";
import { mapOpenCodeError } from "../lib/opencode/errors";
import type { Config } from "../lib/config";
import { formatTokens } from "../lib/format";
import { OpenSessionAction } from "./actions";
import type { SessionInfo } from "../lib/opencode/types";

type LoadingToast = Awaited<ReturnType<typeof showToast>>;

interface TranscriptMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly time: number | undefined;
  readonly tools: readonly string[];
}

function messageText(message: { type: string; text?: unknown; content?: unknown }): string {
  // User messages carry their text directly; assistant messages carry text
  // parts inside `content`.
  if (message.type === "user") return typeof message.text === "string" ? message.text : "";
  if (message.type !== "assistant") return "";
  const parts = (message.content ?? []) as Array<{ type: string; text?: string }>;
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function messageTools(message: { type: string; content?: unknown }): readonly string[] {
  if (message.type !== "assistant") return [];
  const parts = (message.content ?? []) as Array<{ type: string; name?: string }>;
  return parts.filter((part) => part.type === "tool" && part.name).map((part) => part.name as string);
}

export function toTranscript(messages: readonly unknown[]): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  for (const raw of messages) {
    const message = raw as { id?: string; time?: { created?: number }; type: string; text?: unknown; content?: unknown };
    const role = message.type === "user" || message.type === "assistant" ? message.type : undefined;
    if (!role) continue;
    const text = messageText(message);
    const tools = messageTools(message);
    if (!text && tools.length === 0) continue;
    out.push({
      id: message.id ?? `m${out.length}`,
      role,
      text,
      time: message.time?.created,
      tools,
    });
  }
  return out;
}

/**
 * Chat-style markdown in natural reading order (oldest at top, newest at
 * bottom), like a chat app. Turns that produced no text are left out; their
 * tool usage lives in the metadata pane.
 */
export function transcriptMarkdown(messages: readonly TranscriptMessage[], newestFirst = false): string {
  const ordered = newestFirst ? [...messages].reverse() : messages;
  const withText = ordered.filter((message) => message.text);
  if (withText.length === 0) {
    const tools = uniqueTools(messages);
    return tools.length > 0
      ? `**OpenCode**\n\nTool calls only, no text output.\n\n**Tools used:** ${tools.join(", ")}`
      : "";
  }
  return withText
    .map((message) => {
      const author = message.role === "user" ? "**You**" : "**OpenCode**";
      const toolNote = message.tools.length > 0 ? `\n\n**Tools used:** ${message.tools.join(", ")}` : "";
      return `${author}\n\n${message.text}${toolNote}`;
    })
    .join("\n\n---\n\n");
}

/** Tool names used across a transcript, first use first, without duplicates. */
function uniqueTools(messages: readonly TranscriptMessage[]): readonly string[] {
  const seen = new Set<string>();
  for (const message of messages) {
    for (const tool of message.tools) seen.add(tool);
  }
  return [...seen];
}

/** The text of the newest assistant message that produced text. */
export function lastAssistantText(messages: readonly TranscriptMessage[]): string | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant" && message.text)?.text;
}

/**
 * Full transcript of a session as one markdown window, like the Ask
 * conversation view, with session info in the metadata pane. Pushed from the
 * session list.
 */
export function SessionTranscriptView(props: {
  readonly endpoint: Endpoint;
  readonly config: Config;
  readonly session: SessionInfo;
}): ReactNode {
  const [messages, setMessages] = useState<readonly TranscriptMessage[] | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const raw = await service.messages(props.session.id);
        if (controller.signal.aborted) return;
        setMessages(toTranscript(raw as readonly unknown[]));
      } catch (caught) {
        if (controller.signal.aborted) return;
        setFailed(mapOpenCodeError(caught).message);
      }
    })();
    return () => controller.abort();
  }, [props.session.id, service]);

  const session = props.session;
  const lastText = messages ? lastAssistantText(messages) : undefined;
  const tools = messages ? uniqueTools(messages) : [];
  const markdown = failed
    ? `**Transcript could not be loaded.**\n\n${failed}`
    : messages === undefined
      ? "…"
      : messages.length > 0
        ? transcriptMarkdown(messages)
        : "**No transcript messages.**";

  // Loading feedback: Detail has no isLoading prop, so an animated toast
  // covers the wait and is hidden once the transcript arrives.
  const [loadingToast, setLoadingToast] = useState<LoadingToast | undefined>(undefined);
  useEffect(() => {
    if (messages === undefined && failed === undefined && !loadingToast) {
      void showToast({ style: Toast.Style.Animated, title: "Loading transcript" }).then(setLoadingToast);
    }
    if ((messages !== undefined || failed !== undefined) && loadingToast) {
      void loadingToast.hide();
      setLoadingToast(undefined);
    }
  }, [messages, failed, loadingToast]);

  return (
    <Detail
      markdown={markdown}
      navigationTitle={`Transcript · ${session.title || "Untitled session"}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Messages"
            text={messages ? `${messages.length}` : "…"}
          />
          <Detail.Metadata.Label
            title="Model"
            text={session.model ? `${session.model.providerID}/${session.model.id}` : "default"}
          />
          <Detail.Metadata.Label
            title="Tokens"
            text={session.tokens ? formatTokens(session.tokens.input + session.tokens.output) : "unknown"}
          />
          {tools.length > 0 ? (
            <Detail.Metadata.Label title="Tools Used" text={tools.join(", ")} />
          ) : null}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Cost" text={`$${session.cost.toFixed(4)}`} />
          <Detail.Metadata.Label title="Created" text={new Date(session.time.created).toLocaleString()} />
          <Detail.Metadata.Label title="Updated" text={new Date(session.time.updated).toLocaleString()} />
          <Detail.Metadata.Label title="Session ID" text={session.id} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <OpenSessionAction
            sessionID={session.id}
            directory={session.location?.directory}
            config={props.config}
            title="Resume in Terminal"
          />
          {lastText ? (
            <Action.CopyToClipboard title="Copy Last Agent Message" shortcut="copy" content={lastText} />
          ) : null}
          {messages && messages.length > 0 ? (
            <Action.CopyToClipboard
              title="Copy Transcript"
              content={transcriptMarkdown(messages)}
            />
          ) : null}
        </ActionPanel>
      }
    />
  );
}
