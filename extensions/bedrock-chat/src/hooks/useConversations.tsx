import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Conversation, ConversationsHook } from "../type";
import { truncateTitle } from "../utils/generateTitle";

/**
 * Patches old conversations loaded from storage that may be missing
 * the new required fields (title, hasImages, modelId on chats).
 */
function migrateConversation(c: Partial<Conversation> & { id: string; chats: Conversation["chats"] }): Conversation {
  return {
    ...c,
    title: c.title || (c.chats[0]?.question ? truncateTitle(c.chats[0].question) : "Untitled"),
    hasImages: c.hasImages ?? false,
    model: c.model ?? {
      id: "default",
      name: "Default",
      prompt: "",
      option: "",
      temperature: "1",
      pinned: false,
      updated_at: "",
      created_at: "",
    },
    pinned: c.pinned ?? false,
    updated_at: c.updated_at ?? c.created_at ?? "",
    created_at: c.created_at ?? "",
    chats: c.chats.map((chat) => ({
      ...chat,
      modelId: chat.modelId || c.model?.option || "",
    })),
  } as Conversation;
}

export function useConversations(): ConversationsHook {
  const [data, setData] = useState<Conversation[]>([]);
  const [isLoading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const storedConversations = await LocalStorage.getItem<string>("conversations");

      if (storedConversations) {
        const parsed: Conversation[] = JSON.parse(storedConversations);
        const migrated = parsed.map(migrateConversation);
        setData((previous) => [...previous, ...migrated]);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    LocalStorage.setItem("conversations", JSON.stringify(data.filter((x) => x.chats.length > 0)));
  }, [data]);

  const add = useCallback(
    async (conversation: Conversation) => {
      setData([...data, conversation]);
    },
    [setData, data],
  );

  const update = useCallback(
    async (conversation: Conversation) => {
      setData((prev) => {
        return prev.map((x) => {
          if (x.id === conversation.id) {
            return conversation;
          }
          return x;
        });
      });
    },
    [setData, data],
  );

  const setConversations = useCallback(
    async (conversations: Conversation[]) => {
      setData(conversations);
    },
    [setData],
  );

  const remove = useCallback(
    async (conversation: Conversation) => {
      const toast = await showToast({
        title: "Removing conversation...",
        style: Toast.Style.Animated,
      });
      const newConversations: Conversation[] = data.filter((item) => item.id !== conversation.id);
      setData(newConversations);
      toast.title = "Conversation removed!";
      toast.style = Toast.Style.Success;
    },
    [setData, data],
  );

  const clear = useCallback(async () => {
    const toast = await showToast({
      title: "Clearing conversations ...",
      style: Toast.Style.Animated,
    });
    setData([]);
    toast.title = "Conversations cleared!";
    toast.style = Toast.Style.Success;
  }, [setData]);

  return useMemo(
    () => ({ data, isLoading, add, update, remove, clear, setConversations }),
    [data, isLoading, add, update, remove, clear, setConversations],
  );
}
