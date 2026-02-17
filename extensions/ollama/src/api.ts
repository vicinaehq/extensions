/**
 * Ollama API client
 * 
 * Based on the Raycast Ollama extension by Massimiliano Pasquini
 * Original: https://github.com/raycast/extensions/tree/main/extensions/raycast-ollama
 * Original Author: Massimiliano Pasquini (massimiliano_pasquini)
 * 
 * Adapted for Vicinae by Norman Steger (voodoods)
 */

import { OllamaListResponse, OllamaChatRequest, OllamaChatResponse } from '@/types';

export class OllamaAPI {
  private baseURL: string;

  constructor(baseURL: string = 'http://localhost:11434') {
    this.baseURL = baseURL;
  }

  async listModels(): Promise<OllamaListResponse> {
    const response = await fetch(`${this.baseURL}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    return await response.json();
  }

  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.statusText}`);
    }

    return await response.json();
  }

  async *chatStream(request: OllamaChatRequest): AsyncGenerator<OllamaChatResponse> {
    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`Chat stream request failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    try {
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              yield data;
            } catch (e) {
              console.error('Failed to parse JSON:', e);
            }
          }
        }
      }
    } finally {
      reader.cancel();
    }
  }
}
