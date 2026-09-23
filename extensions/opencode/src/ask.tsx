import { Action, ActionPanel, Icon, List, Toast, clearSearchBar, showToast, useNavigation } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOpenCodeCommand } from "./components/command-gate";
import type { Config } from "./lib/config";
import { createOpenCodeService, type OpenCodeService } from "./lib/opencode/client";
import type { Endpoint } from "./lib/opencode/discovery";
import { mapOpenCodeError } from "./lib/opencode/errors";
import type { Project, V2Event } from "./lib/opencode/types";
import { parseModelRef, modelValue } from "./lib/models";
import { relativeTime } from "./lib/time";
import { OpenSessionAction } from "./components/actions";
import { ModelDropdown, modelLabel } from "./components/model-dropdown";
import { ModelPickerList } from "./components/model-picker";
import { ProjectPickerList, basename } from "./components/project-picker";
import { ConversationDetail, type ConversationMessage, type SharedConversation } from "./components/conversation-detail";

const ASK_TITLE_MAX = 60;
const COMPLETION_EVENT_TYPES = new Set([
  "session.idle",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
]);

interface ChatMessage extends ConversationMessage {}

function eventSessionID(event: V2Event): string | undefined {
  const data = (event as { readonly data?: { readonly sessionID?: string } }).data;
  return data?.sessionID;
}

/** Consume the event stream until the session stops producing output. */
async function consumeStream(
  service: OpenCodeService,
  sessionID: string,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<void> {
  try {
    for await (const event of service.events(signal)) {
      if (signal.aborted) return;
      if (eventSessionID(event) !== sessionID) continue;
      if (event.type === "session.text.delta") {
        const delta = (event as { readonly data?: { readonly delta?: string } }).data?.delta;
        if (delta) onDelta(delta);
      } else if (COMPLETION_EVENT_TYPES.has(event.type)) {
        return;
      }
    }
  } catch {
    // Stream errors are non-fatal; the final text is fetched from the session.
  }
}

/** The authoritative final text of the latest assistant message. */
async function finalAssistantText(service: OpenCodeService, sessionID: string): Promise<string | undefined> {
  try {
    const messages = await service.messages(sessionID);
    const assistant = [...messages].reverse().find((message) => message.type === "assistant");
    if (!assistant) return undefined;
    const text = (assistant.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .join("");
    return text || undefined;
  } catch {
    return undefined;
  }
}

function firstLine(text: string): string {
  const line = text.split("\n", 1)[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line || "(empty)";
}

/**
 * Ask: one multi-turn conversation with OpenCode, optionally scoped to a
 * project. The search bar is the input and the newest exchange always appears
 * right under it, so responses are visible while they stream. Every prompt is
 * exactly the text you typed. Changing the project starts a fresh conversation
 * in the new scope. Conversations never span projects. Hand off to OpenCode
 * when the ask becomes real work.
 */
export function AskView(props: { readonly endpoint: Endpoint; readonly config: Config }): ReactNode {
  const { push, pop } = useNavigation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionID, setSessionID] = useState<string | undefined>(undefined);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [searchText, setSearchText] = useState("");
  const [busy, setBusy] = useState(false);
  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);

  // Friendly model names for the message tag; falls back to the raw id.
  useEffect(() => {
    const controller = new AbortController();
    void service
      .models()
      .then((list) => {
        if (controller.signal.aborted) return;
        const names: Record<string, string> = {};
        for (const model of list) names[`${model.providerID}/${model.id}`] = modelLabel(model);
        setModelNames(names);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [service]);

  const selectedModelName = selectedModelId ? (modelNames[selectedModelId] ?? selectedModelId) : undefined;

  // Shared ref so the pushed conversation detail can always read the latest state.
  const sharedRef = useRef<SharedConversation>({ messages: [], busy: false });
  useEffect(() => {
    sharedRef.current = {
      messages,
      ...(sessionID !== undefined ? { sessionID } : {}),
      ...(selectedModelId !== undefined ? { modelId: selectedModelId } : {}),
      busy,
    };
  }, [busy, messages, selectedModelId, sessionID]);

  // The in-flight stream, aborted when the conversation resets so an old run
  // never keeps consuming or leaking into a new one.
  const streamControllerRef = useRef<AbortController | null>(null);

  const appendDelta = useCallback((delta: string) => {
    setMessages((previous) =>
      previous.map((message) => (message.streaming ? { ...message, text: message.text + delta } : message)),
    );
  }, []);

  const send = useCallback(
    async (rawInput: string) => {
      const text = rawInput.trim();
      if (!text || busy) return;
      setBusy(true);
      const scope = project;
      const assistantPlaceholderId = `a${Date.now()}`;
      try {
        let id = sessionID;
        if (!id) {
          const model = selectedModelId ? parseModelRef(selectedModelId) : undefined;
          const created = await service.createSession({
            ...(scope ? { directory: scope.canonical } : {}),
            title: `Ask: ${text.slice(0, ASK_TITLE_MAX)}`,
            ...(model ? { model } : {}),
          });
          id = created.id;
          setSessionID(id);
        }
        setMessages((previous) => [
          ...previous,
          { id: `u${Date.now()}`, role: "user", text, time: Date.now() },
          { id: assistantPlaceholderId, role: "assistant", text: "", time: Date.now(), streaming: true },
        ]);
        const controller = new AbortController();
        streamControllerRef.current?.abort();
        streamControllerRef.current = controller;
        const streamTask = consumeStream(service, id, controller.signal, appendDelta);
        try {
          await service.sendPrompt(id, text);
          await streamTask;
        } finally {
          controller.abort();
          if (streamControllerRef.current === controller) streamControllerRef.current = null;
        }
        const finalText = await finalAssistantText(service, id);
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantPlaceholderId
              ? { ...message, text: finalText ?? message.text, streaming: false }
              : message,
          ),
        );
      } catch (error) {
        const mapped = mapOpenCodeError(error);
        setMessages((previous) => [
          ...previous.filter((message) => !message.streaming),
          { id: `e${Date.now()}`, role: "error", text: mapped.message, time: Date.now() },
        ]);
        await showToast({ style: Toast.Style.Failure, title: "Ask failed", message: mapped.message });
      } finally {
        setBusy(false);
      }
    },
    [appendDelta, busy, project, selectedModelId, service, sessionID],
  );

  const lastResponse = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.text),
    [messages],
  );

  const newConversation = useCallback(() => {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setMessages([]);
    setSessionID(undefined);
    setSearchText("");
  }, []);

  /** Scope to a project (or back to none). A live conversation does not continue. It restarts. */
  const scopeTo = useCallback(
    (next: Project | undefined) => {
      if (sessionID || messages.length > 0) {
        streamControllerRef.current?.abort();
        streamControllerRef.current = null;
        setMessages([]);
        setSessionID(undefined);
        setSearchText("");
        if (next) {
          void showToast({
            style: Toast.Style.Success,
            title: `New conversation in ${basename(next.canonical)}`,
          });
        }
      }
      setProject(next);
    },
    [messages.length, sessionID],
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      const model = parseModelRef(modelId);
      if (!model) return;
      if (!sessionID) {
        setSelectedModelId(modelId);
        return;
      }
      void (async () => {
        try {
          await service.switchModel(sessionID, model);
          setSelectedModelId(modelId);
        } catch {
          await showToast({
            style: Toast.Style.Failure,
            title: "Model switch failed",
            message: "Keeping the previous model.",
          });
        }
      })();
    },
    [service, sessionID],
  );

  const stop = useCallback(() => {
    if (!sessionID) return;
    void service.interrupt(sessionID).catch(() => {
      void showToast({ style: Toast.Style.Failure, title: "Failed to stop OpenCode" });
    });
  }, [service, sessionID]);

  const sendCurrent = useCallback(() => {
    const text = searchText.trim();
    if (!text) {
      void showToast({ title: "Type a prompt first" });
      return;
    }
    if (busy) {
      void showToast({ title: "OpenCode is still responding" });
      return;
    }
    void send(text);
    void clearSearchBar();
  }, [searchText, send, busy]);

  const askActions = (
    <ActionPanel>
      <Action title="Send" icon="speech-bubble" onAction={sendCurrent} />
      {busy && sessionID ? (
        <Action title="Stop" icon="circle-disabled" shortcut={{ modifiers: ["cmd"], key: "." }} onAction={stop} />
      ) : null}
      <Action
        title="Choose Project"
        icon="folder"
        shortcut={{ modifiers: ["cmd"], key: "p" }}
        onAction={() =>
          push(
            <ProjectPickerList
              endpoint={props.endpoint}
              onPick={(picked) => {
                scopeTo(picked);
                pop();
              }}
              navigationTitle="Choose Project"
            />,
          )
        }
      />
      <Action
        title="Choose Model"
        icon="bolt"
        shortcut={{ modifiers: ["cmd"], key: "m" }}
        onAction={() =>
          push(
            <ModelPickerList
              endpoint={props.endpoint}
              onPick={(picked) => handleModelChange(modelValue(picked))}
            />,
          )
        }
      />
      {project ? (
        <Action
          title="Clear Project"
          icon="circle-disabled"
          shortcut={{ modifiers: ["opt"], key: "p" }}
          onAction={() => scopeTo(undefined)}
        />
      ) : null}
      {sessionID ? (
        <Action
          title="View Conversation"
          icon="text"
          shortcut="open"
          onAction={() =>
            push(
              <ConversationDetail
                shared={sharedRef}
                config={props.config}
                endpoint={props.endpoint}
                onNewConversation={newConversation}
              />,
            )
          }
        />
      ) : null}
      {lastResponse ? (
        <Action.CopyToClipboard
          title="Copy Last Response"
          shortcut="copy"
          content={lastResponse.text}
        />
      ) : null}
      {sessionID ? <OpenSessionAction sessionID={sessionID} config={props.config} /> : null}
      {messages.length > 0 ? (
        <Action
          title="New Conversation"
          icon="rotate-clockwise"
          shortcut="new"
          onAction={newConversation}
        />
      ) : null}
    </ActionPanel>
  );

  const visibleMessages = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <List
      isLoading={busy}
      isShowingDetail
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={
        busy ? "OpenCode is thinking…" : messages.length > 0 ? "Ask a follow-up…" : "Ask anything"
      }
      searchBarAccessory={<ModelDropdown endpoint={props.endpoint} value={selectedModelId} onChange={handleModelChange} />}
      navigationTitle={project ? `Ask · ${basename(project.canonical)}` : "Ask"}
      actions={askActions}
    >
      {visibleMessages.length === 0 ? (
        <List.EmptyView
          icon={Icon.SpeechBubble}
          title="Ask OpenCode anything"
          description={
            project
              ? `Scoped to ${basename(project.canonical)}. Type a prompt above. OpenCode will work on it in this project.`
              : "Type a question above and press enter. No project needed. Hand off to OpenCode when it becomes real work."
          }
        />
      ) : (
        visibleMessages.map((message) => (
          <List.Item
            key={message.id}
            id={message.id}
            title={
              message.role === "error"
                ? message.text
                : message.streaming
                  ? firstLine(message.text) || "Thinking…"
                  : firstLine(message.text)
            }
            subtitle={
              message.role === "user"
                ? "You"
                : message.role === "assistant"
                  ? "Assistant"
                  : ""
            }
            icon={message.role === "user" ? Icon.Person : message.role === "error" ? Icon.Warning : Icon.SpeechBubble}
            accessories={
              message.role === "assistant" && selectedModelName
                ? [{ tag: { value: selectedModelName, color: "#6e79f0" } }, { text: relativeTime(message.time) }]
                : [{ text: relativeTime(message.time) }]
            }
            detail={
              <List.Item.Detail
                markdown={
                  message.role === "error"
                    ? `**${message.text}**`
                    : message.text || (message.streaming ? "…" : "")
                }
              />
            }
            actions={askActions}
          />
        ))
      )}
    </List>
  );
}

export default function AskCommand(): ReactNode {
  const command = useOpenCodeCommand();
  if (!command.ready) return command.view;
  return <AskView endpoint={command.endpoint} config={command.config} />;
}
