/**
 * Chat with Ollama command
 * 
 * Based on the Raycast Ollama extension by Massimiliano Pasquini
 * Original: https://github.com/raycast/extensions/tree/main/extensions/raycast-ollama
 * Original Author: Massimiliano Pasquini (massimiliano_pasquini)
 * 
 * Adapted for Vicinae by Norman Steger (voodoods)
 */

import { Toast, getPreferenceValues, showToast } from '@vicinae/api';
import React, { useState, useEffect } from 'react';
import { OllamaAPI } from '@/api';
import { OllamaChatMessage } from '@/types';
import { useThreads } from '@/hooks/useThreads';
import { useModels } from '@/hooks/useModels';
import { useSystemPromptHistory } from '@/hooks/useSystemPromptHistory';
import { ThreadListView } from '@/components/ThreadListView';
import { ChatView } from '@/components/ChatView';
import { NewConversationForm } from '@/components/NewConversationForm';
import { ChatSettingsForm } from '@/components/ChatSettingsForm';
import { sendChatMessage } from '@/utils/chatLogic';

interface Preferences {
  ollamaServer: string;
  chatHistoryMessagesNumber: string;
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const api = new OllamaAPI(preferences.ollamaServer);
  
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showNewConversationForm, setShowNewConversationForm] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const threadsHook = useThreads();
  const modelsHook = useModels(api);
  const promptHistoryHook = useSystemPromptHistory();

  useEffect(() => {
    modelsHook.loadModels();
    threadsHook.loadThreads();
    promptHistoryHook.loadSystemPromptHistory();
  }, []);

  async function handleDeleteThread(threadId: string) {
    await threadsHook.deleteThread(threadId);
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
    }
  }

  async function handleSendMessage(message: string, threadId: string) {
    if (!message.trim()) return;

    const thread = threadsHook.threads.find(t => t.id === threadId);
    if (!thread) return;

    setIsLoading(true);

    try {
      const maxMessages = parseInt(preferences.chatHistoryMessagesNumber) || 20;

      await sendChatMessage(
        api,
        thread,
        message,
        maxMessages,
        async (userMsg: OllamaChatMessage, assistantMsg: OllamaChatMessage, newTitle?: string) => {
          await threadsHook.addMessagesToThread(
            threadId,
            [userMsg, assistantMsg],
            newTitle
          );
        }
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveSettings(threadId: string, nextModel: string, nextPrompt: string) {
    const thread = threadsHook.threads.find(t => t.id === threadId);
    if (!thread) return;

    const trimmedPrompt = nextPrompt.trim();
    const oldPrompt = thread.systemPrompt;

    // Update history if prompt is different from current
    await promptHistoryHook.addToHistory(trimmedPrompt, oldPrompt);

    // Update the thread
    await threadsHook.updateThread(threadId, {
      model: nextModel || thread.model,
      systemPrompt: trimmedPrompt,
    });

    showToast({
      style: Toast.Style.Success,
      title: 'Chat settings saved',
      message: trimmedPrompt ? 'System prompt updated.' : 'System prompt cleared.',
    });
  }

  async function handleCreateConversation(model: string, systemPrompt: string) {
    const newThread = threadsHook.createNewThread(model, systemPrompt);
    const updated = [newThread, ...threadsHook.threads];
    await threadsHook.saveThreads(updated);
    setSelectedThreadId(newThread.id);
    setShowNewConversationForm(false);
  }

  // Show chat settings if triggered
  if (showChatSettings && selectedThreadId) {
    const thread = threadsHook.threads.find(t => t.id === selectedThreadId);
    if (thread) {
      return (
        <ChatSettingsForm
          thread={thread}
          models={modelsHook.models}
          systemPromptHistory={promptHistoryHook.globalSystemPromptHistory}
          onSaveSettings={async (threadId, model, prompt) => {
            await handleSaveSettings(threadId, model, prompt);
            setShowChatSettings(false);
          }}
        />
      );
    }
  }

  // Show chat view if a thread is selected
  if (selectedThreadId) {
    const thread = threadsHook.threads.find(t => t.id === selectedThreadId);
    if (thread) {
      return (
        <ChatView
          thread={thread}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          onDeleteThread={handleDeleteThread}
          onOpenSettings={() => setShowChatSettings(true)}
        />
      );
    }
  }

  // Show new conversation form if triggered
  if (showNewConversationForm) {
    return (
      <NewConversationForm
        models={modelsHook.models}
        defaultModel={modelsHook.defaultModel}
        systemPromptHistory={promptHistoryHook.globalSystemPromptHistory}
        onCreateConversation={handleCreateConversation}
      />
    );
  }

  // Show thread list
  return (
    <ThreadListView
      threads={threadsHook.threads}
      isLoading={isLoading}
      onSelectThread={setSelectedThreadId}
      onDeleteThread={handleDeleteThread}
      onCreateNew={() => setShowNewConversationForm(true)}
    />
  );
}
