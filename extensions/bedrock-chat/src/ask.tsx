import { Action, ActionPanel, clearSearchBar, Detail, Icon, List, useNavigation } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { PrimaryAction } from "./actions";
import { PreferencesActionSection } from "./actions/preferences";
import { usePreferences } from "./hooks/usePreferences";
import { useChat } from "./hooks/useChat";
import { useConversations } from "./hooks/useConversations";
import { DEFAULT_MODEL, useModel } from "./hooks/useModel";
import { useSavedChat } from "./hooks/useSavedChat";
import { useBedrock } from "./hooks/useBedrock";
import { useCachedModelSelection } from "./hooks/useCachedModelSelection";
import { usePolling } from "./hooks/usePolling";
import { Chat, ChatHook, Conversation, Model } from "./type";
import { EmptyView } from "./views/empty";
import { CopyActionSection } from "./actions/copy";
import { SaveActionSection } from "./actions/save";
import { DestructiveAction, TextToSpeechAction } from "./actions";
import { buildConversationMarkdown, forkChats, getLatestChat } from "./utils";
import { generateTitle, truncateTitle } from "./utils/generateTitle";
import { ModelDropdown } from "./views/model-dropdown";
import { ModelPicker } from "./views/model-picker";
import { ChatListItems } from "./views/chat-list-items";
import { getModelDisplayName } from "./utils/modelInfo";

/**
 * Pushed Detail view for showing the conversation.
 * Lives on the navigation stack so it's immune to parent re-renders.
 * Uses a shared ref to read the latest chats/conversation state.
 */
function ConversationDetailView({
  sharedState,
  onStartNewConversation,
}: {
  sharedState: React.RefObject<SharedState>;
  onStartNewConversation: () => void;
}) {
  const { pop } = useNavigation();
  const savedChats = useSavedChat();

  // Poll the shared ref to pick up streaming updates from the parent.
  usePolling(50);

  const state = sharedState.current;
  const chats = state.chats;
  const conversation = state.conversation;

  const streamingChat = chats.streamData ? { id: chats.streamData.id, answer: chats.streamData.answer } : undefined;

  const markdown = buildConversationMarkdown(chats.data, chats.isLoading, streamingChat);
  const latestChat = getLatestChat(chats.data);

  return (
    <Detail
      markdown={markdown}
      navigationTitle={getModelDisplayName(latestChat?.modelId || conversation.model.option)}
      actions={
        <ActionPanel>
          <Action title="Ask Follow-Up" icon="icon.png" onAction={() => pop()} />
          {latestChat?.answer && (
            <>
              <CopyActionSection answer={latestChat.answer} question={latestChat.question} />
              <SaveActionSection onSaveAnswerAction={() => savedChats.add(latestChat)} />
              <ActionPanel.Section title="Output">
                <TextToSpeechAction content={latestChat.answer} />
              </ActionPanel.Section>
            </>
          )}
          <ActionPanel.Section title="Restart">
            <DestructiveAction
              title="Start New Conversation"
              icon="icon.png"
              dialog={{
                title: "Are you sure you want to start a new conversation?",
                primaryButton: "Start New",
              }}
              onAction={() => {
                onStartNewConversation();
                pop();
              }}
              shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
            />
          </ActionPanel.Section>
          <PreferencesActionSection />
        </ActionPanel>
      }
    />
  );
}

interface SharedState {
  chats: ChatHook;
  conversation: Conversation;
}

export default function Ask(props: { conversation?: Conversation; initialQuestion?: string }) {
  const conversations = useConversations();
  const models = useModel();
  const savedChats = useSavedChat();
  const { titleModel, titlePrompt } = usePreferences();
  const chats = useChat<Chat>(props.conversation ? props.conversation.chats : []);
  const { push } = useNavigation();
  const bedrockClient = useBedrock();

  const [searchText, setSearchText] = useState<string>("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [pendingFork, setPendingFork] = useState<{ question: string; model: Model } | null>(null);
  const titleGeneratedRef = useRef(!!props.conversation?.title);

  const [conversation, setConversation] = useState<Conversation>(
    props.conversation ?? {
      id: uuidv4(),
      title: "",
      chats: [],
      model: DEFAULT_MODEL,
      pinned: false,
      hasImages: false,
      updated_at: "",
      created_at: new Date().toISOString(),
    },
  );

  const prevConversationId = useRef(conversation.id);

  // Shared ref so the pushed Detail view can always read the latest state
  const sharedStateRef = useRef<SharedState>({ chats, conversation });
  sharedStateRef.current = { chats, conversation };

  const [selectedOption, setSelectedOption] = useCachedModelSelection(
    "selected_bedrock_model",
    DEFAULT_MODEL.option,
    models.isLoading,
    props.conversation?.model.option,
  );

  const pushDetailView = useCallback(() => {
    push(
      <ConversationDetailView
        sharedState={sharedStateRef}
        onStartNewConversation={() => {
          setConversation({
            id: uuidv4(),
            title: "",
            chats: [],
            model: conversation.model,
            pinned: false,
            hasImages: false,
            updated_at: "",
            created_at: new Date().toISOString(),
          });
          titleGeneratedRef.current = false;
          chats.clear();
          clearSearchBar();
          chats.setLoading(false);
        }}
      />,
    );
  }, [push, conversation.model, chats]);

  useEffect(() => {
    if (props.initialQuestion) {
      chats.ask(props.initialQuestion, [], conversation.model);
      pushDetailView();
    } else if (props.conversation && props.conversation.chats.length > 0) {
      pushDetailView();
    }
  }, []);

  useEffect(() => {
    if (props.conversation?.id !== conversation.id || conversations.data.length === 0) {
      conversations.add(conversation);
    }
  }, []);

  useEffect(() => {
    conversations.update(conversation);
  }, [conversation]);

  useEffect(() => {
    if (models.isLoading) {
      return;
    }
    if (models.data && conversation.chats.length === 0) {
      const defaultUserModel = models.data[DEFAULT_MODEL.id] ?? conversation.model;
      setConversation({ ...conversation, model: defaultUserModel, updated_at: new Date().toISOString() });
    }
  }, [models.isLoading, models.data]);

  useEffect(() => {
    const updatedConversation = { ...conversation, chats: chats.data, updated_at: new Date().toISOString() };
    setConversation(updatedConversation);
  }, [chats.data]);

  useEffect(() => {
    if (models.isLoading) {
      return;
    }
    setConversation((prev) => ({
      ...prev,
      model: { ...prev.model, option: selectedOption },
      updated_at: new Date().toISOString(),
    }));
  }, [selectedOption, models.isLoading]);

  // Execute the forked ask after state has settled (chats.data is updated)
  useEffect(() => {
    if (pendingFork) {
      chats.ask(pendingFork.question, [], pendingFork.model);
      pushDetailView();
      setPendingFork(null);
    }
  }, [pendingFork]);

  // When conversation ID changes (fork), add the new conversation to storage
  useEffect(() => {
    if (conversation.id !== prevConversationId.current) {
      conversations.add(conversation);
      prevConversationId.current = conversation.id;
    }
  }, [conversation.id]);

  // Generate title after the first chat response completes
  useEffect(() => {
    if (titleGeneratedRef.current) return;
    const completedChats = chats.data.filter((c) => c.answer.length > 0);
    if (completedChats.length === 0 || chats.isLoading) return;

    titleGeneratedRef.current = true;
    const firstChat = completedChats[0];
    // Set an immediate fallback title
    setConversation((prev) => ({
      ...prev,
      title: prev.title || truncateTitle(firstChat.question),
    }));
    // Generate AI title in the background
    generateTitle(bedrockClient, titleModel, titlePrompt, firstChat.question, firstChat.answer).then((title) => {
      setConversation((prev) => ({ ...prev, title }));
    });
  }, [chats.data, chats.isLoading]);

  const handleSubmit = () => {
    if (searchText.trim().length === 0) return;
    if (chats.isLoading) return;

    if (editingChatId) {
      // Fork in-place: reset state to a new conversation with chats before the edited question
      const { keptChats } = forkChats(chats.data, editingChatId);
      const forkedConversation: Conversation = {
        id: uuidv4(),
        title: truncateTitle(searchText.trim()),
        chats: keptChats,
        model: conversation.model,
        pinned: false,
        hasImages: false,
        updated_at: "",
        created_at: new Date().toISOString(),
      };
      const editedQuestion = searchText.trim();
      chats.setData(keptChats);
      setConversation(forkedConversation);
      setPendingFork({ question: editedQuestion, model: conversation.model });
      setEditingChatId(null);
      clearSearchBar();
      setSearchText("");
      return;
    }

    chats.ask(searchText.trim(), [], conversation.model);
    clearSearchBar();
    setSearchText("");
    pushDetailView();
  };

  const cancelEdit = () => {
    setEditingChatId(null);
    clearSearchBar();
    setSearchText("");
  };

  const handleRegenerate = (chat: Chat) => {
    const { keptChats } = forkChats(chats.data, chat.id);
    push(
      <ModelPicker
        options={models.option}
        currentOption={conversation.model.option}
        onSelectModel={(option) => {
          const newModel = { ...conversation.model, option };
          const forkedConversation: Conversation = {
            id: uuidv4(),
            title: truncateTitle(chat.question),
            chats: keptChats,
            model: newModel,
            pinned: false,
            hasImages: false,
            updated_at: "",
            created_at: new Date().toISOString(),
          };
          chats.setData(keptChats);
          setConversation(forkedConversation);
          setPendingFork({ question: chat.question, model: newModel });
        }}
      />,
    );
  };

  // List view - always the base view, search bar for input
  return (
    <List
      searchText={searchText}
      filtering={false}
      isLoading={chats.isLoading || models.isLoading}
      onSearchTextChange={setSearchText}
      throttle={false}
      navigationTitle={getModelDisplayName(getLatestChat(chats.data)?.modelId || selectedOption)}
      actions={
        <ActionPanel>
          {chats.isLoading ? null : editingChatId && searchText.trim().length > 0 ? (
            <PrimaryAction title="Submit Edited Question" onAction={handleSubmit} />
          ) : editingChatId ? (
            <Action title="Cancel Edit" icon={Icon.XMarkCircle} onAction={cancelEdit} />
          ) : searchText.trim().length > 0 ? (
            <PrimaryAction title="Get Answer" onAction={handleSubmit} />
          ) : null}
          <PreferencesActionSection />
        </ActionPanel>
      }
      searchBarAccessory={<ModelDropdown options={models.option} value={selectedOption} onChange={setSelectedOption} />}
      searchBarPlaceholder={
        chats.isLoading
          ? "Generating response..."
          : editingChatId
            ? "Edit question..."
            : chats.data.length > 0
              ? "Ask follow-up..."
              : "Ask AI anything..."
      }
    >
      {chats.data.length === 0 ? (
        <EmptyView />
      ) : (
        <ChatListItems
          chats={chats.data}
          isLoading={chats.isLoading}
          editingChatId={editingChatId}
          searchText={searchText}
          onSubmit={handleSubmit}
          onCancelEdit={cancelEdit}
          onRegenerate={handleRegenerate}
          onEditQuestion={(chatId, question) => {
            setEditingChatId(chatId);
            setSearchText(question);
          }}
          onViewConversation={pushDetailView}
        />
      )}
    </List>
  );
}
