import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSystemPromptHistory } from '../useSystemPromptHistory';
import { LocalStorage } from '@vicinae/api';

describe('useSystemPromptHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadSystemPromptHistory', () => {
    it('should load history from LocalStorage', async () => {
      const mockHistory = ['Prompt 1', 'Prompt 2', 'Prompt 3'];
      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(mockHistory));

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      expect(result.current.globalSystemPromptHistory).toEqual(mockHistory);
    });

    it('should handle missing history gracefully', async () => {
      vi.mocked(LocalStorage.getItem).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      expect(result.current.globalSystemPromptHistory).toEqual([]);
    });

    it('should handle invalid JSON gracefully', async () => {
      vi.mocked(LocalStorage.getItem).mockResolvedValue('invalid json');

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      expect(result.current.globalSystemPromptHistory).toEqual([]);
    });
  });

  describe('addToHistory', () => {
    it('should add new prompt to history', async () => {
      const existingHistory = ['Old prompt'];
      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(existingHistory));

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      await act(async () => {
        await result.current.addToHistory('New prompt', 'Old prompt');
      });

      const savedCall = vi.mocked(LocalStorage.setItem).mock.calls[0];
      expect(savedCall[0]).toBe('ollama.systemPromptHistory');

      const savedHistory = JSON.parse(savedCall[1] as string);
      expect(savedHistory).toContain('Old prompt');
      expect(result.current.globalSystemPromptHistory).toContain('Old prompt');
    });

    it('should not add duplicate prompts', async () => {
      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify([]));

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      await act(async () => {
        await result.current.addToHistory('Same prompt', 'Same prompt');
      });

      // Should not save if prompts are identical
      expect(result.current.globalSystemPromptHistory).toEqual([]);
    });

    it('should not add empty prompts', async () => {
      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify([]));

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      await act(async () => {
        await result.current.addToHistory('   ', 'Old prompt');
      });

      expect(result.current.globalSystemPromptHistory).toEqual([]);
    });

    it('should limit history to 10 items', async () => {
      const largeHistory = Array.from({ length: 10 }, (_, i) => `Prompt ${i}`);
      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(largeHistory));

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      await act(async () => {
        await result.current.addToHistory('New prompt', 'Prompt 0');
      });

      const savedData = vi.mocked(LocalStorage.setItem).mock.calls[0][1];
      const savedHistory = JSON.parse(savedData as string);

      expect(savedHistory).toHaveLength(10);
    });

    it('should remove duplicates when adding to history', async () => {
      const existingHistory = ['Prompt 1', 'Prompt 2', 'Prompt 3'];
      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(existingHistory));

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      // Add Prompt 2 again - it should be moved to the front, not duplicated
      await act(async () => {
        await result.current.addToHistory('Prompt 2', 'Prompt 1');
      });

      const savedData = vi.mocked(LocalStorage.setItem).mock.calls[0][1];
      const savedHistory = JSON.parse(savedData as string);

      // Should have Prompt 1 first, then Prompt 3 (Prompt 2 is filtered out as duplicate)
      expect(savedHistory).toEqual(['Prompt 1', 'Prompt 3']);
    });

    it('should filter out empty strings from history', async () => {
      const existingHistory = ['Prompt 1', '', 'Prompt 2'];
      vi.mocked(LocalStorage.getItem).mockResolvedValue(JSON.stringify(existingHistory));

      const { result } = renderHook(() => useSystemPromptHistory());

      await act(async () => {
        await result.current.loadSystemPromptHistory();
      });

      await act(async () => {
        await result.current.addToHistory('New prompt', 'Prompt 1');
      });

      const savedData = vi.mocked(LocalStorage.setItem).mock.calls[0][1];
      const savedHistory = JSON.parse(savedData as string);

      expect(savedHistory).not.toContain('');
    });
  });

  describe('initial state', () => {
    it('should have empty history initially', () => {
      const { result } = renderHook(() => useSystemPromptHistory());

      expect(result.current.globalSystemPromptHistory).toEqual([]);
    });
  });
});

