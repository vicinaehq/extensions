import { LocalStorage, Toast, showToast } from '@vicinae/api';
import { useState, useCallback } from 'react';
import { OllamaConversationThread, OllamaChatMessage } from '@/types';
import { generateUniqueId } from '@/utils/keyGenerator';

export function useThreads() {
  const [threads, setThreads] = useState<OllamaConversationThread[]>([]);

  const loadThreads = useCallback(async () => {
    try {
      const stored = await LocalStorage.getItem<string>('ollama.threads');
      if (stored) {
        const parsedThreads: OllamaConversationThread[] = JSON.parse(stored);
        // Sort by most recently updated first
        parsedThreads.sort((a, b) => b.updatedAt - a.updatedAt);
        setThreads(parsedThreads);
      }
    } catch (e) {
      // Invalid JSON, start fresh
    }
  }, []);

  const saveThreads = useCallback(async (updatedThreads: OllamaConversationThread[]) => {
    try {
      await LocalStorage.setItem('ollama.threads', JSON.stringify(updatedThreads));
      setThreads(updatedThreads);
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'Failed to save thread',
        message: String(e),
      });
    }
  }, []);

  const createNewThread = useCallback((model: string, systemPrompt: string): OllamaConversationThread => {
    const now = Date.now();
    return {
      id: generateUniqueId('thread'),
      title: 'New Conversation',
      model,
      systemPrompt,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }, []);

  const deleteThread = useCallback(async (threadId: string) => {
    const updated = threads.filter(t => t.id !== threadId);
    await saveThreads(updated);
    return updated;
  }, [threads, saveThreads]);

  const updateThread = useCallback(async (threadId: string, updates: Partial<OllamaConversationThread>) => {
    const updatedThreads = threads.map(thread => {
      if (thread.id === threadId) {
        return {
          ...thread,
          ...updates,
          updatedAt: Date.now()
        };
      }
      return thread;
    });
    updatedThreads.sort((a, b) => b.updatedAt - a.updatedAt);
    await saveThreads(updatedThreads);
  }, [threads, saveThreads]);

  const addMessagesToThread = useCallback(async (threadId: string, messages: OllamaChatMessage[], newTitle?: string) => {
    const updatedThreads = threads.map(thread => {
      if (thread.id === threadId) {
        return {
          ...thread,
          messages: [...thread.messages, ...messages],
          title: newTitle || thread.title,
          updatedAt: Date.now(),
        };
      }
      return thread;
    });
    updatedThreads.sort((a, b) => b.updatedAt - a.updatedAt);
    await saveThreads(updatedThreads);
  }, [threads, saveThreads]);

  return {
    threads,
    loadThreads,
    saveThreads,
    createNewThread,
    deleteThread,
    updateThread,
    addMessagesToThread,
  };
}
