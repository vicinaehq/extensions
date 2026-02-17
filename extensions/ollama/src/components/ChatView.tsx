import { Action, ActionPanel, Detail, List } from '@vicinae/api';
import React, { useState } from 'react';
import { OllamaConversationThread } from '@/types';

interface ChatViewProps {
  thread: OllamaConversationThread;
  isLoading: boolean;
  onSendMessage: (message: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onOpenSettings: () => void;
}

export function ChatView({
  thread,
  isLoading,
  onSendMessage,
  onDeleteThread,
  onOpenSettings,
}: ChatViewProps) {
  const [draftMessage, setDraftMessage] = useState<string>('');

  return (
    <List
      isLoading={isLoading}
      searchText={draftMessage}
      onSearchTextChange={setDraftMessage}
      searchBarPlaceholder="Ask anything..."
      navigationTitle={thread.title}
    >
      <List.Section title="Send Message">
        <List.Item
          title={draftMessage.trim() ? `Send: ${draftMessage.trim()}` : 'Type your message and press Enter'}
          subtitle={`Model: ${thread.model}`}
          actions={
            <ActionPanel>
              <Action
                title="Send Message"
                onAction={() => {
                  onSendMessage(draftMessage, thread.id);
                  setDraftMessage('');
                }}
              />
              <Action
                title="Chat Settings"
                onAction={onOpenSettings}
              />
              <Action
                title="Delete Thread"
                style={Action.Style.Destructive}
                onAction={() => onDeleteThread(thread.id)}
              />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Chat History">
        {[...thread.messages].reverse().map((msg) => (
          <List.Item
            key={msg.id}
            title={msg.role === 'user' ? '👤 You' : '🦙 Ollama'}
            subtitle={msg.content}
            accessories={[{ text: msg.role }]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Full Message"
                  target={
                    <Detail
                      navigationTitle={msg.role === 'user' ? 'You' : 'Ollama'}
                      markdown={msg.content}
                    />
                  }
                />
                <Action.CopyToClipboard title="Copy Message" content={msg.content} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

