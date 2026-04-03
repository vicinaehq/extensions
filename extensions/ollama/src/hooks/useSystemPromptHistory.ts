import { LocalStorage } from '@vicinae/api';
import { useState, useCallback } from 'react';

export function useSystemPromptHistory() {
  const [globalSystemPromptHistory, setGlobalSystemPromptHistory] = useState<string[]>([]);

  const loadSystemPromptHistory = useCallback(async () => {
    try {
      const stored = await LocalStorage.getItem<string>('ollama.systemPromptHistory');
      if (stored) {
        setGlobalSystemPromptHistory(JSON.parse(stored));
      }
    } catch (e) {
      // Invalid JSON, start fresh
    }
  }, []);

  const addToHistory = useCallback(async (newPrompt: string, currentPrompt: string) => {
    const trimmedPrompt = newPrompt.trim();
    if (trimmedPrompt && trimmedPrompt !== currentPrompt) {
      const newHistory = [
        currentPrompt,
        ...globalSystemPromptHistory.filter(prompt => prompt !== currentPrompt && prompt !== trimmedPrompt)
      ].filter(prompt => prompt.length > 0).slice(0, 10);

      await LocalStorage.setItem('ollama.systemPromptHistory', JSON.stringify(newHistory));
      setGlobalSystemPromptHistory(newHistory);
    }
  }, [globalSystemPromptHistory]);

  return {
    globalSystemPromptHistory,
    loadSystemPromptHistory,
    addToHistory,
  };
}
