import { useCallback, useRef, useState } from "react";
import { showToast, Toast } from "@vicinae/api";
import { streamText } from "ai";
import { getModel } from "../lib/opencode";
import {
  buildConversation,
  getConversation,
  saveConversation,
} from "../lib/conversations";
import { fetchSessionTitle } from "../lib/session";
import type { Conversation, Message } from "../lib/types";
import { generateId } from "../lib/types";

interface UseChatOptions {
  model: string;
  systemPrompt?: string;
}

interface UseChatReturn {
  conversationId: string;
  messages: Message[];
  isLoading: boolean;
  input: string;
  setInput: (text: string) => void;
  sendMessage: (content?: string) => Promise<void>;
  conversation: Conversation | null;
  newConversation: () => void;
  startFresh: (text: string) => Promise<void>;
  loadConversation: (id: string, messages: Message[]) => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const { model, systemPrompt } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef(generateId());
  const sessionIdRef = useRef<string | undefined>(undefined);
  const [conversationId, setConversationId] = useState(
    conversationIdRef.current,
  );

  const sendMessage = useCallback(
    async (content?: string) => {
      const text = (content ?? input).trim();
      if (!text || isLoading) return;

      setInput("");

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };

      const updatedMessages = [...messages, userMessage, assistantMessage];
      setMessages(updatedMessages);
      setIsLoading(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const aiMessages = updatedMessages
          .filter((m) => m.role !== "system" && m.content !== "")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        const result = streamText({
          model: getModel(model),
          system: systemPrompt || undefined,
          messages: aiMessages,
          abortSignal: controller.signal,
        });

        let fullContent = "";

        for await (const chunk of result.textStream) {
          if (controller.signal.aborted) break;
          fullContent += chunk;
          const snapshot = fullContent;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              updated[updated.length - 1] = { ...last, content: snapshot };
            }
            return updated;
          });
        }

        // Capture session ID from provider metadata
        const response = await result.response;
        const newSessionId =
          (response as { providerMetadata?: { opencode?: { sessionId?: string } } })
            .providerMetadata?.opencode?.sessionId;
        if (newSessionId) {
          sessionIdRef.current = newSessionId;
        }

        // Build and save conversation
        const existing = await getConversation(conversationIdRef.current);
        const finalMessages = updatedMessages.map((m, i) =>
          i === updatedMessages.length - 1
            ? { ...m, content: fullContent }
            : m,
        );

        // Try to get the session title from OpenCode (auto-generated summary)
        let sessionTitle: string | undefined;
        if (sessionIdRef.current) {
          // Small delay to let OpenCode generate the title after the first exchange
          setTimeout(async () => {
            if (!sessionIdRef.current) return;
            const title = await fetchSessionTitle(sessionIdRef.current);
            if (title) {
              const current = await getConversation(conversationIdRef.current);
              if (current) {
                current.title = title;
                current.sessionId = sessionIdRef.current;
                await saveConversation(current);
                setConversation({ ...current });
              }
            }
          }, 3000);
        }

        const conv = buildConversation(
          conversationIdRef.current,
          finalMessages,
          model,
          existing,
          sessionIdRef.current,
          sessionTitle,
        );
        await saveConversation(conv);
        setConversation(conv);
        setMessages(finalMessages);
      } catch (error) {
        if (controller.signal.aborted) return;

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.content === "") {
            updated[updated.length - 1] = {
              ...last,
              content: `*Error: ${errorMessage}*`,
            };
          }
          return updated;
        });

        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to get response",
          message: errorMessage.includes("ECONNREFUSED")
            ? "OpenCode server is not running. Make sure OpenCode is installed and running."
            : errorMessage,
        });
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [input, isLoading, messages, model, systemPrompt],
  );

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    const id = generateId();
    conversationIdRef.current = id;
    sessionIdRef.current = undefined;
    setConversationId(id);
    setMessages([]);
    setIsLoading(false);
    setInput("");
    setConversation(null);
  }, []);

  const loadConversation = useCallback((id: string, msgs: Message[]) => {
    abortRef.current?.abort();
    conversationIdRef.current = id;
    sessionIdRef.current = undefined;
    setConversationId(id);
    setMessages(msgs);
    setIsLoading(false);
    setInput("");
    setConversation(null);
  }, []);

  /**
   * Start a fresh conversation with an initial message.
   * Resets all state atomically and sends the message with an empty
   * history — avoids the stale closure issue of calling
   * newConversation() + sendMessage() separately.
   */
  const startFresh = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Reset state
      abortRef.current?.abort();
      const id = generateId();
      conversationIdRef.current = id;
      sessionIdRef.current = undefined;
      setConversationId(id);
      setInput("");
      setConversation(null);

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };

      // Start fresh — no previous messages
      const freshMessages = [userMessage, assistantMessage];
      setMessages(freshMessages);
      setIsLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = streamText({
          model: getModel(model),
          system: systemPrompt || undefined,
          messages: [{ role: "user" as const, content: trimmed }],
          abortSignal: controller.signal,
        });

        let fullContent = "";

        for await (const chunk of result.textStream) {
          if (controller.signal.aborted) break;
          fullContent += chunk;
          const snapshot = fullContent;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              updated[updated.length - 1] = { ...last, content: snapshot };
            }
            return updated;
          });
        }

        const response = await result.response;
        const newSessionId =
          (response as { providerMetadata?: { opencode?: { sessionId?: string } } })
            .providerMetadata?.opencode?.sessionId;
        if (newSessionId) {
          sessionIdRef.current = newSessionId;
        }

        const finalMessages = freshMessages.map((m, i) =>
          i === freshMessages.length - 1
            ? { ...m, content: fullContent }
            : m,
        );

        if (sessionIdRef.current) {
          setTimeout(async () => {
            if (!sessionIdRef.current) return;
            const title = await fetchSessionTitle(sessionIdRef.current);
            if (title) {
              const current = await getConversation(conversationIdRef.current);
              if (current) {
                current.title = title;
                current.sessionId = sessionIdRef.current;
                await saveConversation(current);
                setConversation({ ...current });
              }
            }
          }, 3000);
        }

        const conv = buildConversation(
          conversationIdRef.current,
          finalMessages,
          model,
          undefined,
          sessionIdRef.current,
        );
        await saveConversation(conv);
        setConversation(conv);
        setMessages(finalMessages);
      } catch (error) {
        if (controller.signal.aborted) return;

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.content === "") {
            updated[updated.length - 1] = {
              ...last,
              content: `*Error: ${errorMessage}*`,
            };
          }
          return updated;
        });

        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to get response",
          message: errorMessage.includes("ECONNREFUSED")
            ? "OpenCode server is not running. Make sure OpenCode is installed and running."
            : errorMessage,
        });
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [model, systemPrompt],
  );

  return {
    conversationId,
    messages,
    isLoading,
    input,
    setInput,
    sendMessage,
    conversation,
    newConversation,
    startFresh,
    loadConversation,
  };
}
