import {
  Action,
  ActionPanel,
  confirmAlert,
  Alert,
  Icon,
  List,
  getPreferenceValues,
  useNavigation,
} from "@vicinae/api";
import type { Conversation, Message, Preferences } from "../lib/types";
import { modelName, relativeDate, truncate } from "../lib/types";
import { providerStyle } from "../lib/providers";
import { useEffect, useRef, useState } from "react";
import { useChat } from "../hooks/useChat";
import { useConversations } from "../hooks/useConversations";
import { useAutoScrollMarkdown } from "../hooks/useAutoScrollMarkdown";
import { ModelDropdown } from "./ModelDropdown";
import { ModelSelector } from "./ModelSelector";
import { formatConversationMarkdown } from "../lib/markdown";

export function ChatView() {
  const preferences = getPreferenceValues<Preferences>();
  const [selectedModel, setSelectedModel] = useState(preferences.model);
  const { push } = useNavigation();

  const {
    conversationId,
    messages,
    isLoading,
    input,
    setInput,
    sendMessage,
    newConversation,
    startFresh,
    loadConversation,
  } = useChat({
    model: selectedModel,
    systemPrompt: preferences.systemPrompt,
  });

  const { conversations, isLoading: isLoadingHistory, remove, clearAll, refresh } =
    useConversations();

  // On first load, resume the most recent conversation
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (
      !isLoadingHistory &&
      !initialLoadDone.current &&
      conversations.length > 0
    ) {
      initialLoadDone.current = true;
      const latest = conversations[0]!;
      loadConversation(latest.id, latest.messages);
      setSelectedModel(latest.model);
    }
  }, [isLoadingHistory, conversations, loadConversation]);

  const hasInput = input.trim().length > 0;
  const hasMessages = messages.length > 0;

  const history = conversations.filter((c) => c.id !== conversationId);

  function handleNewConversation() {
    newConversation();
    void refresh();
  }

  function handleNewConversationWithMessage() {
    const text = input.trim();
    if (!text) return;
    void startFresh(text);
    void refresh();
  }

  return (
    <List
      filtering={false}
      searchText={input}
      onSearchTextChange={setInput}
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Type your message..."
      navigationTitle="Ask AI"
      searchBarAccessory={
        <ModelDropdown
          value={selectedModel}
          onChange={setSelectedModel}
        />
      }
    >
      <List.Section title="Current">
        <CurrentItem
          messages={messages}
          model={selectedModel}
          isLoading={isLoading}
          hasInput={hasInput}
          hasMessages={hasMessages}
          onSend={sendMessage}
          onNew={handleNewConversation}
          onNewWithMessage={handleNewConversationWithMessage}
          onSelectModel={() =>
            push(<ModelSelector currentModel={selectedModel} onSelect={setSelectedModel} />)
          }
        />
      </List.Section>

      {history.length > 0 && (
        <List.Section title="History" subtitle={`${history.length}`}>
          {history.map((conv) => (
            <HistoryItem
              key={conv.id}
              conv={conv}
              hasInput={hasInput}
              onSend={sendMessage}
              onResume={(id, msgs, model) => {
                loadConversation(id, msgs);
                setSelectedModel(model);
              }}
              onDelete={remove}
              onNew={handleNewConversation}
              onNewWithMessage={handleNewConversationWithMessage}
              onSelectModel={() =>
                push(<ModelSelector currentModel={selectedModel} onSelect={setSelectedModel} />)
              }
              onClearAll={clearAll}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

// ── Current conversation item ──────────────────────────────────────

interface CurrentItemProps {
  messages: Message[];
  model: string;
  isLoading: boolean;
  hasInput: boolean;
  hasMessages: boolean;
  onSend: () => Promise<void>;
  onNew: () => void;
  onNewWithMessage: () => void;
  onSelectModel: () => void;
}

function CurrentItem({
  messages,
  model,
  isLoading,
  hasInput,
  hasMessages,
  onSend,
  onNew,
  onNewWithMessage,
  onSelectModel,
}: CurrentItemProps) {
  const markdownRaw = formatConversationMarkdown(messages, isLoading);
  const markdown = useAutoScrollMarkdown(markdownRaw, isLoading);
  const style = providerStyle(model);
  const exchangeCount = messages.filter((m) => m.role === "user").length;

  let title: string;
  let subtitle: string;
  if (!hasMessages) {
    title = "New conversation";
    subtitle = "Type a message above to start";
  } else {
    const first = messages.find((m) => m.role === "user");
    title = first ? truncate(first.content, 50) : "New conversation";
    subtitle = truncate(messages[messages.length - 1]?.content ?? "", 60);
  }

  const accessories: List.Item.Accessory[] = [];
  if (hasMessages) {
    accessories.push({
      tag: { value: modelName(model), color: style.color },
    });
    accessories.push({
      text: String(exchangeCount),
      icon: Icon.SpeechBubble,
    });
  }

  return (
    <List.Item
      id="current"
      title={title}
      subtitle={subtitle}
      icon={hasMessages ? { value: style.icon, tooltip: model } : Icon.Plus}
      accessories={accessories}
      detail={
        <List.Item.Detail markdown={markdown} isLoading={isLoading} />
      }
      actions={
        <ActionPanel>
          {hasInput ? (
            <Action
              title="Send Message"
              icon={Icon.ArrowRight}
              onAction={onSend}
            />
          ) : (
            <Action
              title="Type a Message"
              icon={Icon.Pencil}
              onAction={() => {
                // no-op — focus stays on search bar
              }}
            />
          )}
          {hasInput && (
            <Action
              title="New Chat with Message"
              icon={Icon.PlusCircle}
              shortcut={{ modifiers: ["shift"], key: "return" }}
              onAction={onNewWithMessage}
            />
          )}
          <Action
            title="New Conversation"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["ctrl"], key: "space" }}
            onAction={onNew}
          />
          <Action
            title="Select Model"
            icon={Icon.Switch}
            shortcut={{ modifiers: ["ctrl"], key: "m" }}
            onAction={onSelectModel}
          />
          <Action.CopyToClipboard
            title="Copy Conversation"
            content={markdownRaw}
            shortcut={{ modifiers: ["ctrl"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}

// ── History conversation item ──────────────────────────────────────

interface HistoryItemProps {
  conv: Conversation;
  hasInput: boolean;
  onSend: () => Promise<void>;
  onResume: (id: string, messages: Message[], model: string) => void;
  onDelete: (id: string) => Promise<void>;
  onNew: () => void;
  onNewWithMessage: () => void;
  onSelectModel: () => void;
  onClearAll: () => Promise<void>;
}

function HistoryItem({
  conv,
  hasInput,
  onSend,
  onResume,
  onDelete,
  onNew,
  onNewWithMessage,
  onSelectModel,
  onClearAll,
}: HistoryItemProps) {
  const markdownRaw = formatConversationMarkdown(conv.messages, false);
  const markdown = useAutoScrollMarkdown(markdownRaw);
  const style = providerStyle(conv.model);
  const exchangeCount = conv.messages.filter((m) => m.role === "user").length;

  const lastAI = [...conv.messages].reverse().find((m) => m.role === "assistant");
  const subtitle = lastAI ? truncate(lastAI.content, 60) : "";

  return (
    <List.Item
      id={conv.id}
      title={conv.title}
      subtitle={subtitle}
      icon={{ value: style.icon, tooltip: conv.model }}
      accessories={[
        {
          tag: { value: modelName(conv.model), color: style.color },
        },
        {
          text: String(exchangeCount),
          icon: Icon.SpeechBubble,
        },
        {
          text: relativeDate(conv.updatedAt),
          icon: Icon.Clock,
        },
      ]}
      detail={<List.Item.Detail markdown={markdown} />}
      actions={
        <ActionPanel>
          {hasInput ? (
            <Action
              title="Send Message"
              icon={Icon.ArrowRight}
              onAction={onSend}
            />
          ) : (
            <Action
              title="Resume Conversation"
              icon={Icon.ArrowRight}
              onAction={() => onResume(conv.id, conv.messages, conv.model)}
            />
          )}
          {hasInput && (
            <Action
              title="New Chat with Message"
              icon={Icon.PlusCircle}
              shortcut={{ modifiers: ["shift"], key: "return" }}
              onAction={onNewWithMessage}
            />
          )}
          <Action
            title="New Conversation"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["ctrl"], key: "space" }}
            onAction={onNew}
          />
          <Action
            title="Select Model"
            icon={Icon.Switch}
            shortcut={{ modifiers: ["ctrl"], key: "m" }}
            onAction={onSelectModel}
          />
          <Action.CopyToClipboard
            title="Copy Conversation"
            content={markdownRaw}
            shortcut={{ modifiers: ["ctrl"], key: "c" }}
          />
          <Action
            title="Delete Conversation"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl"], key: "d" }}
            onAction={async () => {
              const confirmed = await confirmAlert({
                title: "Delete Conversation",
                message: `Delete "${conv.title}"?`,
                primaryAction: {
                  title: "Delete",
                  style: Alert.ActionStyle.Destructive,
                },
              });
              if (confirmed) await onDelete(conv.id);
            }}
          />
          <Action
            title="Clear All History"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
            onAction={async () => {
              const confirmed = await confirmAlert({
                title: "Clear All History",
                message:
                  "Delete all saved conversations? This cannot be undone.",
                primaryAction: {
                  title: "Clear All",
                  style: Alert.ActionStyle.Destructive,
                },
              });
              if (confirmed) await onClearAll();
            }}
          />
        </ActionPanel>
      }
    />
  );
}
