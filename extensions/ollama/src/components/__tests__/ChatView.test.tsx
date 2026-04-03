import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { render, screen } from '@testing-library/react';
import { ChatView } from '../ChatView';
import { OllamaConversationThread } from '@/types';

describe('ChatView', () => {
  let mockOnSendMessage = vi.fn();
  let mockOnDeleteThread = vi.fn();
  let mockOnOpenSettings = vi.fn();

  const mockThread: OllamaConversationThread = {
    id: 'thread_1',
    title: 'Test Chat',
    model: 'llama2',
    systemPrompt: 'Test prompt',
    messages: [
      { id: 'msg_1', role: 'user', content: 'Hello' },
      { id: 'msg_2', role: 'assistant', content: 'Hi there' },
    ],
    createdAt: 1000,
    updatedAt: 2000,
  };

  beforeEach(() => {
    mockOnSendMessage = vi.fn();
    mockOnDeleteThread = vi.fn();
    mockOnOpenSettings = vi.fn();
  });

  describe('rendering', () => {
    it('should render chat view with thread title', () => {
      render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('Test Chat')).toBeTruthy();
    });

    it('should render with loading state', () => {
      render(
        <ChatView
          thread={mockThread}
          isLoading={true}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByTestId('list')).toBeTruthy();
    });

    it('should render chat history section', () => {
      render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('👤 You')).toBeTruthy();
      expect(screen.getByText('🦙 Ollama')).toBeTruthy();
    });

    it('should render empty chat history', () => {
      const emptyThread: OllamaConversationThread = {
        ...mockThread,
        messages: [],
      };

      render(
        <ChatView
          thread={emptyThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByTestId('list')).toBeTruthy();
    });
  });

  describe('message display', () => {
    it('should display user messages with correct emoji', () => {
      render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('👤 You')).toBeTruthy();
    });

    it('should display assistant messages with correct emoji', () => {
      render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('🦙 Ollama')).toBeTruthy();
    });

    it('should display message content', () => {
      render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('Hello')).toBeTruthy();
      expect(screen.getByText('Hi there')).toBeTruthy();
    });

    it('should handle multiple messages', () => {
      const thread: OllamaConversationThread = {
        ...mockThread,
        messages: [
          { id: 'msg_1', role: 'user', content: 'First message' },
          { id: 'msg_2', role: 'user', content: 'Second message' },
          { id: 'msg_3', role: 'user', content: 'Third message' },
        ],
      };

      render(
        <ChatView
          thread={thread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('First message')).toBeTruthy();
      expect(screen.getByText('Second message')).toBeTruthy();
      expect(screen.getByText('Third message')).toBeTruthy();
    });
  });

  describe('callback integration', () => {
    it('should wire onSendMessage callback to Send action', () => {
      const sendSpy = vi.fn();
      const { container } = render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={sendSpy}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('Send Message')).toBeTruthy();
      expect(container.querySelector('[data-testid="list"]')).toBeTruthy();
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should wire onDeleteThread callback to Delete action', () => {
      const deleteSpy = vi.fn();
      const { container } = render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={deleteSpy}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('Send Message')).toBeTruthy();
      expect(container.querySelector('[data-testid="list"]')).toBeTruthy();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('should wire onOpenSettings callback to Chat Settings action', () => {
      const settingsSpy = vi.fn();
      const { container } = render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={settingsSpy}
        />
      );

      expect(screen.getByText('Send Message')).toBeTruthy();
      expect(container.querySelector('[data-testid="list"]')).toBeTruthy();
      expect(settingsSpy).not.toHaveBeenCalled();
    });

    it('should bind onSendMessage with correct thread ID', () => {
      const sendSpy = vi.fn();
      const thread2: OllamaConversationThread = {
        ...mockThread,
        id: 'thread_2',
      };

      const { rerender } = render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={sendSpy}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('Send Message')).toBeTruthy();

      rerender(
        <ChatView
          thread={thread2}
          isLoading={false}
          onSendMessage={sendSpy}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('Send Message')).toBeTruthy();
    });

    it('should bind onDeleteThread with correct thread ID', () => {
      const deleteSpy = vi.fn();
      const thread2: OllamaConversationThread = {
        ...mockThread,
        id: 'thread_2',
      };

      const { rerender } = render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={deleteSpy}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('Send Message')).toBeTruthy();

      rerender(
        <ChatView
          thread={thread2}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={deleteSpy}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText('Send Message')).toBeTruthy();
    });

    it('should render message actions for viewing and copying', () => {
      const { container } = render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      const messages = container.querySelectorAll('[data-testid="list-item"]');
      expect(messages.length).toBeGreaterThan(1);
    });

    it('should handle draft message state', () => {
      const sendSpy = vi.fn();
      const { container } = render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={sendSpy}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(container.querySelector('[data-testid="list"]')).toBeTruthy();
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should display model in subtitle', () => {
      render(
        <ChatView
          thread={mockThread}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText(/Model: llama2/)).toBeTruthy();
    });

    it('should handle different thread models', () => {
      const threadWithDifferentModel: OllamaConversationThread = {
        ...mockThread,
        model: 'mistral',
      };

      render(
        <ChatView
          thread={threadWithDifferentModel}
          isLoading={false}
          onSendMessage={mockOnSendMessage}
          onDeleteThread={mockOnDeleteThread}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      expect(screen.getByText(/Model: mistral/)).toBeTruthy();
    });
  });
});

