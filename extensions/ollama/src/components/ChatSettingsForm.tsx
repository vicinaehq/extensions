import { Action, ActionPanel, Form } from '@vicinae/api';
import React, { useState } from 'react';
import { OllamaConversationThread } from '@/types';

interface ChatSettingsFormProps {
  thread: OllamaConversationThread;
  models: string[];
  systemPromptHistory: string[];
  onSaveSettings: (threadId: string, model: string, systemPrompt: string) => Promise<void>;
}

export function ChatSettingsForm({
  thread,
  models,
  systemPromptHistory,
  onSaveSettings,
}: ChatSettingsFormProps) {
  const [modelValue, setModelValue] = useState<string>(thread.model);
  const [promptValue, setPromptValue] = useState<string>(thread.systemPrompt);

  const handleSubmit = async () => {
    await onSaveSettings(thread.id, modelValue, promptValue.trim());
  };

  return (
    <Form
      navigationTitle="Chat Settings"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="model"
        title="Model"
        value={modelValue}
        onChange={setModelValue}
      >
        {models.map((model) => (
          <Form.Dropdown.Item key={model} value={model} title={model} />
        ))}
      </Form.Dropdown>
      <Form.TextArea
        id="systemPrompt"
        title="System Prompt"
        value={promptValue}
        onChange={setPromptValue}
      />
      {systemPromptHistory.length > 0 && (
        <Form.Dropdown
          id="historySelect"
          title="Load from History"
          value=""
          onChange={(selectedValue) => {
            if (selectedValue) {
              setPromptValue(selectedValue);
            }
          }}
        >
          <Form.Dropdown.Item key="empty" value="" title="Select a previous prompt..." />
          {systemPromptHistory.map((historyPrompt) => (
            <Form.Dropdown.Item
              key={historyPrompt}
              value={historyPrompt}
              title={historyPrompt.length > 50 ? `${historyPrompt.substring(0, 50)}...` : historyPrompt}
            />
          ))}
        </Form.Dropdown>
      )}
    </Form>
  );
}
