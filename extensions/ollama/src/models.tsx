/**
 * Manage Ollama models command
 * 
 * Based on the Raycast Ollama extension by Massimiliano Pasquini
 * Original: https://github.com/raycast/extensions/tree/main/extensions/raycast-ollama
 * Original Author: Massimiliano Pasquini (massimiliano_pasquini)
 * 
 * Adapted for Vicinae by Norman Steger (voodoods)
 */

import { Action, ActionPanel, List, showToast, Toast, getPreferenceValues } from '@vicinae/api';
import React, { useState, useEffect } from 'react';
import { OllamaAPI } from './api';
import { OllamaModel } from './types';

interface Preferences {
  ollamaServer: string;
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const api = new OllamaAPI(preferences.ollamaServer);
  
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadModels();
  }, []);

  async function loadModels() {
    setIsLoading(true);
    try {
      const response = await api.listModels();
      setModels(response.models);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: 'Failed to load models',
        message: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  return (
    <List isLoading={isLoading}>
      <List.Section title="Installed Models">
        {models.map((model) => (
          <List.Item
            key={model.digest}
            title={model.name}
            subtitle={formatBytes(model.size)}
            accessories={[
              { text: formatDate(model.modified_at) },
            ]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Model Name"
                  content={model.name}
                />
                <Action
                  title="Refresh Models"
                  onAction={loadModels}
                  shortcut={{ modifiers: ['cmd'], key: 'r' }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {models.length === 0 && !isLoading && (
        <List.EmptyView
          title="No Models Found"
          description="Install models using 'ollama pull <model-name>' in your terminal"
        />
      )}
    </List>
  );
}
