import { useCallback, useEffect, useState } from "react";
import {
  clearConversations,
  deleteConversation,
  getConversations,
} from "../lib/conversations";
import type { Conversation } from "../lib/types";

interface UseConversationsReturn {
  conversations: Conversation[];
  isLoading: boolean;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const convs = await getConversations();
      setConversations(convs);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      await refresh();
    },
    [refresh],
  );

  const clearAll = useCallback(async () => {
    await clearConversations();
    setConversations([]);
  }, []);

  return {
    conversations,
    isLoading,
    remove,
    clearAll,
    refresh,
  };
}
