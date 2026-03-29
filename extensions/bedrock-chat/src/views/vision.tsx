import { Action, ActionPanel, Detail, Icon, List, Toast, clearSearchBar, showToast, useNavigation } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import { useBedrock } from "../hooks/useBedrock";
import { useModel } from "../hooks/useModel";
import { useConversations } from "../hooks/useConversations";
import { usePreferences } from "../hooks/usePreferences";
import { usePolling } from "../hooks/usePolling";
import { AskImageProps, Chat, Conversation, Model } from "../type";
import type { ImageFormat, Message, TokenUsage } from "@aws-sdk/client-bedrock-runtime";
import { buildConversationMarkdown, forkChats, getLatestChat, toUnit } from "../utils";
import { converseWithBedrock } from "../utils/bedrock";
import { generateTitle, truncateTitle } from "../utils/generateTitle";
import { LoadFrom, loadFromClipboard, loadFromFinder } from "../utils/load";
import { PrimaryAction } from "../actions";
import { PreferencesActionSection } from "../actions/preferences";
import { CopyActionSection } from "../actions/copy";
import { EmptyView } from "./empty";
import { isVisionModel } from "../utils/modelInfo";
import { ModelPicker } from "./model-picker";
import { ChatListItems } from "./chat-list-items";

const VISION_MODEL: Model = {
  id: "bedrock-vision",
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  name: "Default Vision",
  prompt: "You are a helpful vision assistant.",
  option: "us.anthropic.claude-opus-4-6-v1",
  temperature: "1",
  pinned: false,
  vision: true,
};

interface VisionSharedState {
  chats: Chat[];
  isLoading: boolean;
  streamingChatId: string | null;
  streamingAnswer: string;
  previewPath: string | null;
  tokenUsage: TokenUsage | undefined;
  imageMeta: { height: number; width: number; size: number };
}

/**
 * Pushed Detail view for the vision conversation.
 * Polls a shared ref for streaming updates, same pattern as the Ask command.
 */
function VisionDetailView({ sharedState }: { sharedState: React.RefObject<VisionSharedState> }) {
  const { pop } = useNavigation();

  usePolling(50);

  const state = sharedState.current;
  const { chats, isLoading, streamingChatId, streamingAnswer, previewPath, tokenUsage, imageMeta } = state;

  const streamingChat = streamingChatId ? { id: streamingChatId, answer: streamingAnswer } : undefined;
  const markdownPrefix = previewPath ? `![Source Image](${previewPath})\n\n---` : undefined;
  const markdown = buildConversationMarkdown(chats, isLoading, streamingChat, markdownPrefix);
  const latestChat = getLatestChat(chats);

  return (
    <Detail
      markdown={markdown}
      navigationTitle="Vision"
      actions={
        <ActionPanel>
          <Action title="Ask Follow-Up" icon="icon.png" onAction={() => pop()} />
          {latestChat?.answer && <CopyActionSection answer={latestChat.answer} question={latestChat.question} />}
          <PreferencesActionSection />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          {imageMeta.size ? <Detail.Metadata.Label title="Size" text={toUnit(imageMeta.size)} /> : null}
          {imageMeta.width ? <Detail.Metadata.Label title="Width" text={String(imageMeta.width)} /> : null}
          {imageMeta.height ? <Detail.Metadata.Label title="Height" text={String(imageMeta.height)} /> : null}
          {tokenUsage && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label title="Input Tokens" text={String(tokenUsage.inputTokens ?? 0)} />
              <Detail.Metadata.Label title="Output Tokens" text={String(tokenUsage.outputTokens ?? 0)} />
              <Detail.Metadata.Label title="Total Tokens" text={String(tokenUsage.totalTokens ?? 0)} />
            </>
          )}
        </Detail.Metadata>
      }
    />
  );
}

export function VisionView(props: AskImageProps) {
  const bedrockClient = useBedrock();
  const models = useModel();
  const conversations = useConversations();
  const { push } = useNavigation();
  const { useStream, titleModel, titlePrompt } = usePreferences();

  const [currentModelId, setCurrentModelId] = useState(props.model_override || VISION_MODEL.option);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const titleGeneratedRef = useRef(false);

  const visionModels = models.option.filter(isVisionModel);

  // Image state
  const [imageBytes, setImageBytes] = useState<Uint8Array | null>(null);
  const [imageFormat, setImageFormat] = useState<ImageFormat>("png");
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ height: number; width: number; size: number }>({
    height: 0,
    width: 0,
    size: 0,
  });

  // Conversation state — now uses standard Chat type
  const [chats, setChats] = useState<Chat[]>([]);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | undefined>();
  const [streamingChatId, setStreamingChatId] = useState<string | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState("");

  // Persisted conversation
  const [conversation, setConversation] = useState<Conversation>({
    id: uuidv4(),
    title: "",
    chats: [],
    model: { ...VISION_MODEL, option: props.model_override || VISION_MODEL.option },
    pinned: false,
    hasImages: true,
    updated_at: "",
    created_at: new Date().toISOString(),
  });

  // Auto-save conversation on first mount
  useEffect(() => {
    conversations.add(conversation);
  }, []);

  // Sync chats to conversation and persist
  useEffect(() => {
    if (chats.length === 0) return;
    const updated = { ...conversation, chats, updated_at: new Date().toISOString() };
    setConversation(updated);
    conversations.update(updated);
  }, [chats]);

  // Generate title after the first chat response completes
  useEffect(() => {
    if (titleGeneratedRef.current) return;
    const completedChats = chats.filter((c) => c.answer.length > 0);
    if (completedChats.length === 0 || isLoading) return;

    titleGeneratedRef.current = true;
    const firstChat = completedChats[0];
    // Set an immediate fallback title
    setConversation((prev) => ({
      ...prev,
      title: truncateTitle(firstChat.question),
    }));
    // Generate AI title in the background
    generateTitle(bedrockClient, titleModel, titlePrompt, firstChat.question, firstChat.answer).then((title) => {
      setConversation((prev) => {
        const updated = { ...prev, title };
        conversations.update(updated);
        return updated;
      });
    });
  }, [chats, isLoading]);

  // Shared ref for the pushed detail view
  const sharedStateRef = useRef<VisionSharedState>({
    chats,
    isLoading,
    streamingChatId,
    streamingAnswer,
    previewPath,
    tokenUsage,
    imageMeta,
  });
  sharedStateRef.current = { chats, isLoading, streamingChatId, streamingAnswer, previewPath, tokenUsage, imageMeta };

  const pushDetailView = useCallback(() => {
    push(<VisionDetailView sharedState={sharedStateRef} />);
  }, [push]);

  // Load image on mount and ask the initial question
  useEffect(() => {
    (async () => {
      let data: LoadFrom | undefined;

      if (props.imageData) {
        data = props.imageData;
      } else if (props.load === "selected") {
        data = await loadFromFinder();
      } else {
        data = await loadFromClipboard();
      }

      if (!data) {
        setErrorMsg("Data couldn't load. Check image selection or clipboard and try again.");
        return;
      }

      const fmt = (typeof data.type === "string" ? data.type : "png") as ImageFormat;
      const bytes = new Uint8Array(data.data);
      const w = typeof data.type === "object" ? data.type.width : 0;
      const h = typeof data.type === "object" ? data.type.height : 0;

      setImageBytes(bytes);
      setImageFormat(fmt);
      setImageMeta({ height: h, width: w, size: data.data.length });

      // Save preview
      try {
        const tmpFile = path.join(os.tmpdir(), "vicinae-vision-preview.png");
        await fs.writeFile(tmpFile, data.data);
        setPreviewPath(tmpFile);
      } catch {
        // non-critical
      }

      // Ask the initial question
      askQuestion(props.user_prompt || "Describe this image:", bytes, fmt, [], currentModelId);
    })();
  }, []);

  async function askQuestion(
    question: string,
    imgBytes?: Uint8Array,
    imgFormat?: ImageFormat,
    existingMessages?: Message[],
    modelOverride?: string,
  ) {
    const bytes = imgBytes ?? imageBytes;
    const fmt = imgFormat ?? imageFormat;
    if (!bytes) return;

    setIsLoading(true);

    const msgs: Message[] = existingMessages ?? conversationMessages;
    const useModelId = modelOverride ?? currentModelId;

    // Build user message: first message includes the image, follow-ups are text-only
    const userContent: Message["content"] =
      msgs.length === 0 ? [{ text: question }, { image: { format: fmt, source: { bytes } } }] : [{ text: question }];

    const newMessages: Message[] = [...msgs, { role: "user", content: userContent }];

    // Create chat entry using standard Chat type
    const chatId = `vision-${Date.now()}`;
    const newChat: Chat = {
      id: chatId,
      question,
      answer: "",
      files: [],
      created_at: new Date().toISOString(),
      modelId: useModelId,
    };
    setChats((prev) => [...prev, newChat]);
    setStreamingChatId(chatId);
    setStreamingAnswer("");

    // Push detail view
    pushDetailView();

    const toast = await showToast(Toast.Style.Animated, "thinking...");
    const now = new Date();

    try {
      const system = VISION_MODEL.prompt ? [{ text: VISION_MODEL.prompt }] : undefined;
      const inferenceConfig = { temperature: Number(VISION_MODEL.temperature) };

      const { answer: fullAnswer } = await converseWithBedrock({
        client: bedrockClient,
        modelId: useModelId,
        system,
        messages: newMessages,
        inferenceConfig,
        useStream,
        onStreamDelta: (accumulated) => setStreamingAnswer(accumulated),
        onUsage: (u) => setTokenUsage(u),
      });

      // Finalize chat entry
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, answer: fullAnswer } : c)));
      setConversationMessages([...newMessages, { role: "assistant", content: [{ text: fullAnswer }] }]);

      const duration = (new Date().getTime() - now.getTime()) / 1000;
      toast.style = Toast.Style.Success;
      toast.title = `Finished in ${duration}s`;
    } catch (error) {
      const errMsg = (error as Error).message;
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, answer: `Error: ${errMsg}` } : c)));
      toast.style = Toast.Style.Failure;
      toast.title = "Error";
    }

    setStreamingChatId(null);
    setIsLoading(false);
  }

  const handleSubmit = () => {
    if (searchText.trim().length === 0 || isLoading) return;
    const question = searchText.trim();

    if (editingChatId) {
      // Fork: keep chats and messages before the edited question, then re-ask
      const { keptChats, chatIndex } = forkChats(chats, editingChatId);
      // Each chat = 2 messages (user + assistant), so messages before = chatIndex * 2
      const keptMessages = chatIndex > 0 ? conversationMessages.slice(0, chatIndex * 2) : [];
      setChats(keptChats);
      setConversationMessages(keptMessages);
      setEditingChatId(null);
      clearSearchBar();
      setSearchText("");
      askQuestion(question, undefined, undefined, keptMessages);
      return;
    }

    clearSearchBar();
    setSearchText("");
    askQuestion(question);
  };

  const cancelEdit = () => {
    setEditingChatId(null);
    clearSearchBar();
    setSearchText("");
  };

  const handleRegenerate = (chat: Chat) => {
    const { keptChats, chatIndex } = forkChats(chats, chat.id);
    const keptMessages = chatIndex > 0 ? conversationMessages.slice(0, chatIndex * 2) : [];

    push(
      <ModelPicker
        options={visionModels}
        currentOption={currentModelId}
        onSelectModel={(option) => {
          setCurrentModelId(option);
          setChats(keptChats);
          setConversationMessages(keptMessages);
          askQuestion(chat.question, undefined, undefined, keptMessages, option);
        }}
      />,
    );
  };

  if (errorMsg) {
    return (
      <Detail
        markdown={`## ${errorMsg}`}
        actions={
          <ActionPanel>
            <PreferencesActionSection />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      searchText={searchText}
      filtering={false}
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      throttle={false}
      navigationTitle="Vision"
      searchBarPlaceholder={
        isLoading
          ? "Generating..."
          : editingChatId
            ? "Edit question..."
            : chats.length > 0
              ? "Ask follow-up..."
              : "What is it?"
      }
      actions={
        <ActionPanel>
          {!isLoading && searchText.trim().length > 0 ? (
            <PrimaryAction title="Get Answer" onAction={handleSubmit} />
          ) : null}
          <PreferencesActionSection />
        </ActionPanel>
      }
    >
      {chats.length === 0 ? (
        <EmptyView />
      ) : (
        <ChatListItems
          chats={chats}
          isLoading={isLoading}
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
