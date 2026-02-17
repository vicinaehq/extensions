import { Action, ActionPanel, Form } from '@vicinae/api';
import React, { useState } from 'react';

interface NewConversationFormProps {
  models: string[];
  defaultModel: string;
  systemPromptHistory: string[];
  onCreateConversation: (model: string, systemPrompt: string) => void;
}

export function NewConversationForm({
  models,
  defaultModel,
  systemPromptHistory,
  onCreateConversation,
}: NewConversationFormProps) {
  const [modelValue, setModelValue] = useState<string>(defaultModel);
  const [promptValue, setPromptValue] = useState<string>('');

  const handleCreateConversation = async () => {
    onCreateConversation(modelValue, promptValue.trim());
  };

  return (
    <Form
      navigationTitle="New Conversation"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create"
            onSubmit={handleCreateConversation}
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
