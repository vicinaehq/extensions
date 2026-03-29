import { clearSearchBar, showToast, Toast } from "@vicinae/api";
import { useCallback, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Chat, ChatHook, Model } from "../type";
import { buildUserMessage, chatTransformer } from "../utils";
import { converseWithBedrock } from "../utils/bedrock";
import { usePreferences } from "./usePreferences";
import { useBedrock } from "./useBedrock";

export function useChat<T extends Chat>(props: T[]): ChatHook {
  const [data, setData] = useState<Chat[]>(props);
  const dataRef = useRef<Chat[]>(props);
  dataRef.current = data; // Always keep ref in sync with latest state
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState<boolean>(false);
  const [streamData, setStreamData] = useState<Chat | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const { useStream } = usePreferences();
  const bedrockClient = useBedrock();

  async function ask(question: string, files: string[], model: Model) {
    clearSearchBar();

    setLoading(true);
    const toast = await showToast({
      title: "Getting your answer...",
      style: Toast.Style.Animated,
    });
    let chat: Chat = {
      id: uuidv4(),
      question,
      files,
      answer: "",
      created_at: new Date().toISOString(),
      modelId: model.option,
    };

    setData((prev) => {
      return [...prev, chat];
    });

    setTimeout(async () => {
      setSelectedChatId(chat.id);
    }, 50);

    abortControllerRef.current = new AbortController();
    const { signal: abortSignal } = abortControllerRef.current;

    // Build Bedrock Converse message format — read from ref to avoid stale closure
    const { system, messages: historyMessages } = chatTransformer([...dataRef.current].reverse(), model.prompt);
    const userContent = buildUserMessage(question, files);
    const allMessages = [...historyMessages, { role: "user" as const, content: userContent }];

    const inferenceConfig = {
      temperature: Number(model.temperature),
    };

    try {
      const { answer, usage } = await converseWithBedrock({
        client: bedrockClient,
        modelId: model.option,
        system: system.length > 0 ? system : undefined,
        messages: allMessages,
        inferenceConfig,
        useStream,
        abortSignal,
        onStreamDelta: (fullAnswer) => {
          chat.answer = fullAnswer;
          setStreamData({ ...chat, answer: fullAnswer });
        },
      });

      chat = { ...chat, answer };

      if (useStream) {
        setTimeout(async () => {
          setStreamData(undefined);
        }, 5);
      }

      setLoading(false);
      if (abortSignal.aborted) {
        toast.title = "Request canceled";
        toast.message = undefined;
        toast.style = Toast.Style.Failure;
      } else {
        toast.title = "Got your answer!";
        toast.message = usage?.totalTokens ? `Tokens: ${usage.totalTokens}` : undefined;
        toast.style = Toast.Style.Success;
      }

      setData((prev) => {
        return prev.map((a) => {
          if (a.id === chat.id) {
            return chat;
          }
          return a;
        });
      });
    } catch (err) {
      if (abortSignal.aborted) {
        toast.title = "Request canceled";
        toast.message = undefined;
      } else if (err instanceof Error) {
        if (err.message.includes("429") || err.name === "ThrottlingException") {
          toast.title = "Error";
          toast.message = "Rate limit reached for requests";
        } else {
          toast.title = "Error";
          toast.message = err.message;
        }
      }
      toast.style = Toast.Style.Failure;
      setLoading(false);
    }
  }

  const clear = useCallback(async () => {
    setData([]);
  }, [setData]);

  return useMemo(
    () => ({
      data,
      setData,
      isLoading,
      setLoading,
      selectedChatId,
      setSelectedChatId,
      ask,
      clear,
      streamData,
    }),
    [data, setData, isLoading, setLoading, selectedChatId, setSelectedChatId, ask, clear, streamData],
  );
}
