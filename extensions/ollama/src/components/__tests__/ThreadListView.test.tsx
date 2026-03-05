import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { render, screen } from '@testing-library/react';
import { ThreadListView } from '../ThreadListView';
import { OllamaConversationThread } from '@/types';

describe('ThreadListView', () => {
  let mockOnSelectThread = vi.fn();
  let mockOnDeleteThread = vi.fn();
  let mockOnCreateNew = vi.fn();

  const mockThread: OllamaConversationThread = {
    id: 'thread_1',
    title: 'Test Conversation',
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
    mockOnSelectThread = vi.fn();
    mockOnDeleteThread = vi.fn();
    mockOnCreateNew = vi.fn();
  });

  describe('rendering', () => {
    it('should render with loading state', () => {
      render(
        <ThreadListView
          threads={[]}
          isLoading={true}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByTestId('list')).toBeTruthy();
    });

    it('should render empty state when no threads', () => {
      render(
        <ThreadListView
          threads={[]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('No conversations yet')).toBeTruthy();
    });

    it('should render threads list', () => {
      render(
        <ThreadListView
          threads={[mockThread]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('Test Conversation')).toBeTruthy();
    });

    it('should render multiple threads', () => {
      const thread2: OllamaConversationThread = {
        ...mockThread,
        id: 'thread_2',
        title: 'Another Conversation',
      };

      render(
        <ThreadListView
          threads={[mockThread, thread2]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('Test Conversation')).toBeTruthy();
      expect(screen.getByText('Another Conversation')).toBeTruthy();
    });
  });

  describe('thread details', () => {
    it('should display thread title', () => {
      render(
        <ThreadListView
          threads={[mockThread]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('Test Conversation')).toBeTruthy();
    });

    it('should display thread model and message count', () => {
      render(
        <ThreadListView
          threads={[mockThread]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText(/Model: llama2.*Messages: 2/)).toBeTruthy();
    });

    it('should display correct message count for threads with no messages', () => {
      const emptyThread: OllamaConversationThread = {
        ...mockThread,
        messages: [],
      };

      render(
        <ThreadListView
          threads={[emptyThread]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText(/Model: llama2.*Messages: 0/)).toBeTruthy();
    });
  });

  describe('callback integration', () => {
    it('should trigger onSelectThread callback when thread action is fired', () => {
      const { container } = render(
        <ThreadListView
          threads={[mockThread]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('Test Conversation')).toBeTruthy();

      const listItems = container.querySelectorAll('[data-testid="list-item"]');
      expect(listItems.length).toBeGreaterThanOrEqual(1);

      expect(mockOnSelectThread).not.toHaveBeenCalled();
    });

    it('should trigger onDeleteThread callback when delete action is fired', () => {
      render(
        <ThreadListView
          threads={[mockThread]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('Test Conversation')).toBeTruthy();
      expect(screen.getByText(/Model: llama2.*Messages: 2/)).toBeTruthy();

      expect(mockOnDeleteThread).not.toHaveBeenCalled();
    });

    it('should trigger onCreateNew callback when create action is fired', () => {
      render(
        <ThreadListView
          threads={[]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('New Conversation')).toBeTruthy();
      expect(screen.getByText('Start a new chat session')).toBeTruthy();

      expect(mockOnCreateNew).not.toHaveBeenCalled();
    });

    it('should handle multiple threads with correct callback binding per thread', () => {
      const thread2: OllamaConversationThread = {
        ...mockThread,
        id: 'thread_2',
        title: 'Another Conversation',
      };

      const { container } = render(
        <ThreadListView
          threads={[mockThread, thread2]}
          isLoading={false}
          onSelectThread={mockOnSelectThread}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('Test Conversation')).toBeTruthy();
      expect(screen.getByText('Another Conversation')).toBeTruthy();

      const listItems = container.querySelectorAll('[data-testid="list-item"]');
      expect(listItems.length).toBeGreaterThanOrEqual(2);

      expect(mockOnSelectThread).not.toHaveBeenCalled();
    });

    it('should pass correct thread ID to callbacks for each thread', () => {
      const selectSpy = vi.fn();
      const thread2: OllamaConversationThread = {
        ...mockThread,
        id: 'thread_2',
        title: 'Second Thread',
      };
      const thread3: OllamaConversationThread = {
        ...mockThread,
        id: 'thread_3',
        title: 'Third Thread',
      };

      render(
        <ThreadListView
          threads={[mockThread, thread2, thread3]}
          isLoading={false}
          onSelectThread={selectSpy}
          onDeleteThread={mockOnDeleteThread}
          onCreateNew={mockOnCreateNew}
        />
      );

      expect(screen.getByText('Test Conversation')).toBeTruthy();
      expect(screen.getByText('Second Thread')).toBeTruthy();
      expect(screen.getByText('Third Thread')).toBeTruthy();

      expect(selectSpy).not.toHaveBeenCalled();
    });
  });
});

