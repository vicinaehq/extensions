import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThreads } from '../useThreads';
import { LocalStorage, showToast } from '@vicinae/api';
import { OllamaConversationThread, OllamaChatMessage } from '@/types';

describe('useThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadThreads', () => {
    it('should load threads from LocalStorage', async () => {
      const mockThreads: OllamaConversationThread[] = [
        {
          id: 'thread_1',
          title: 'Test Thread',
          model: 'llama2',
          systemPrompt: 'You are helpful',
          messages: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ];

      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(mockThreads));

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      expect(result.current.threads).toEqual(mockThreads);
    });

    it('should handle missing threads gracefully', async () => {
      vi.mocked(LocalStorage.getItem).mockResolvedValue(undefined);

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      expect(result.current.threads).toEqual([]);
    });

    it('should handle invalid JSON gracefully', async () => {
      vi.mocked(LocalStorage.getItem).mockResolvedValue('invalid json');

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      expect(result.current.threads).toEqual([]);
    });

    it('should sort threads by updatedAt descending', async () => {
      const mockThreads: OllamaConversationThread[] = [
        {
          id: 'thread_1',
          title: 'Old Thread',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'thread_2',
          title: 'New Thread',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 2000,
          updatedAt: 3000,
        },
      ];

      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(mockThreads));

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      expect(result.current.threads[0].id).toBe('thread_2');
      expect(result.current.threads[1].id).toBe('thread_1');
    });
  });

  describe('saveThreads', () => {
    it('should save threads to LocalStorage', async () => {
      const mockThreads: OllamaConversationThread[] = [
        {
          id: 'thread_1',
          title: 'Test Thread',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ];

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.saveThreads(mockThreads);
      });

      expect(LocalStorage.setItem).toHaveBeenCalledWith(
        'ollama.threads',
        JSON.stringify(mockThreads)
      );
      expect(result.current.threads).toEqual(mockThreads);
    });

    it('should show error toast on save failure', async () => {
      const error = new Error('Save failed');
      vi.mocked(LocalStorage.setItem).mockRejectedValue(error);

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.saveThreads([]);
      });

      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          style: 'failure',
          title: 'Failed to save thread',
        })
      );
    });
  });

  describe('createNewThread', () => {
    it('should create a new thread with correct structure', () => {
      const { result } = renderHook(() => useThreads());

      const thread = result.current.createNewThread('llama2', 'System prompt');

      expect(thread).toMatchObject({
        title: 'New Conversation',
        model: 'llama2',
        systemPrompt: 'System prompt',
        messages: [],
      });
      expect(thread.id).toMatch(/^thread_\d+_[a-z0-9]+$/);
      expect(thread.createdAt).toBeGreaterThan(0);
      expect(thread.updatedAt).toBeGreaterThan(0);
    });
  });

  describe('deleteThread', () => {
    it('should remove thread from list', async () => {
      const mockThreads: OllamaConversationThread[] = [
        {
          id: 'thread_1',
          title: 'Thread 1',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'thread_2',
          title: 'Thread 2',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];

      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(mockThreads));

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      const updatedThreads = await act(async () => {
        return await result.current.deleteThread('thread_1');
      });

      expect(updatedThreads).toHaveLength(1);
      expect(updatedThreads[0].id).toBe('thread_2');
    });
  });

  describe('updateThread', () => {
    it('should update thread properties', async () => {
      const mockThreads: OllamaConversationThread[] = [
        {
          id: 'thread_1',
          title: 'Old Title',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(mockThreads));

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      await act(async () => {
        await result.current.updateThread('thread_1', {
          title: 'New Title',
          systemPrompt: 'New prompt',
        });
      });

      // Verify LocalStorage was called with updated data
      const savedData = vi.mocked(LocalStorage.setItem).mock.calls[0][1];
      const savedThreads = JSON.parse(savedData as string);
      expect(savedThreads[0].title).toBe('New Title');
      expect(savedThreads[0].systemPrompt).toBe('New prompt');
      expect(savedThreads[0].updatedAt).toBeGreaterThan(1000);
    });

    it('should resort threads after update', async () => {
      const mockThreads: OllamaConversationThread[] = [
        {
          id: 'thread_1',
          title: 'Thread 1',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 1000,
          updatedAt: 3000,
        },
        {
          id: 'thread_2',
          title: 'Thread 2',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];

      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(mockThreads));

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      // Update thread_2, making it the most recent
      await act(async () => {
        await result.current.updateThread('thread_2', { title: 'Updated' });
      });

      // Verify LocalStorage was called with threads sorted correctly
      const savedData = vi.mocked(LocalStorage.setItem).mock.calls[0][1];
      const savedThreads = JSON.parse(savedData as string);
      expect(savedThreads[0].id).toBe('thread_2');
      expect(savedThreads[1].id).toBe('thread_1');
    });
  });

  describe('addMessagesToThread', () => {
    it('should add messages to thread', async () => {
      const mockThreads: OllamaConversationThread[] = [
        {
          id: 'thread_1',
          title: 'Test Thread',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(mockThreads));

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      const newMessages: OllamaChatMessage[] = [
        { id: 'msg_1', role: 'user', content: 'Hello' },
        { id: 'msg_2', role: 'assistant', content: 'Hi there' },
      ];

      await act(async () => {
        await result.current.addMessagesToThread('thread_1', newMessages);
      });

      // Verify LocalStorage was called with added messages
      const savedData = vi.mocked(LocalStorage.setItem).mock.calls[0][1];
      const savedThreads = JSON.parse(savedData as string);
      expect(savedThreads[0].messages).toEqual(newMessages);
    });

    it('should update thread title if provided', async () => {
      const mockThreads: OllamaConversationThread[] = [
        {
          id: 'thread_1',
          title: 'Old Title',
          model: 'llama2',
          systemPrompt: '',
          messages: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(mockThreads));

      const { result } = renderHook(() => useThreads());

      await act(async () => {
        await result.current.loadThreads();
      });

      const newMessages: OllamaChatMessage[] = [
        { id: 'msg_1', role: 'user', content: 'Hello' },
      ];

      await act(async () => {
        await result.current.addMessagesToThread('thread_1', newMessages, 'New Title');
      });

      // Verify LocalStorage was called with updated title
      const savedData = vi.mocked(LocalStorage.setItem).mock.calls[0][1];
      const savedThreads = JSON.parse(savedData as string);
      expect(savedThreads[0].title).toBe('New Title');
      expect(savedThreads[0].messages[0]).toHaveProperty('id');
      expect(savedThreads[0].messages[0].id).toBe('msg_1');
    });
  });
});

