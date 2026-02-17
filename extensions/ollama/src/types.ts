/**
 * Ollama API types and interfaces
 * 
 * Based on the Raycast Ollama extension by Massimiliano Pasquini
 * Original: https://github.com/raycast/extensions/tree/main/extensions/raycast-ollama
 * Original Author: Massimiliano Pasquini (massimiliano_pasquini)
 * 
 * Adapted for Vicinae by Norman Steger (voodoods)
 */

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface OllamaListResponse {
  models: OllamaModel[];
}

export interface OllamaChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaConversationThread {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  messages: OllamaChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
}
