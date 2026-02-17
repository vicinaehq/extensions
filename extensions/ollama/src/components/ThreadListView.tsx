import { Action, ActionPanel, List } from '@vicinae/api';
import React from 'react';
import { OllamaConversationThread } from '@/types';

interface ThreadListViewProps {
  threads: OllamaConversationThread[];
  isLoading: boolean;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onCreateNew: () => void;
}

export function ThreadListView({
  threads,
  isLoading,
  onSelectThread,
  onDeleteThread,
  onCreateNew,
}: ThreadListViewProps) {
  return (
    <List isLoading={isLoading} navigationTitle="Ollama Conversations">
      <List.Section title="Conversations">
        {threads.length === 0 ? (
          <List.Item
            title="No conversations yet"
            subtitle="Create a new one to get started"
          />
        ) : (
          threads.map(thread => (
            <List.Item
              key={thread.id}
              title={thread.title}
              subtitle={`Model: ${thread.model} • Messages: ${thread.messages.length}`}
              actions={
                <ActionPanel>
                  <Action
                    title="Open Conversation"
                    onAction={() => onSelectThread(thread.id)}
                  />
                  <Action
                    title="Delete Conversation"
                    style={Action.Style.Destructive}
                    onAction={() => onDeleteThread(thread.id)}
                  />
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>
      <List.Section title="Actions">
        <List.Item
          title="New Conversation"
          subtitle="Start a new chat session"
          actions={
            <ActionPanel>
              <Action
                title="Create New Conversation"
                onAction={onCreateNew}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

