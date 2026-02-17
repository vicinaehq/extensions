import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModels } from '../useModels';
import { showToast } from '@vicinae/api';
import { OllamaAPI } from '@/api';

describe('useModels', () => {
  let mockApi: OllamaAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      listModels: vi.fn(),
    } as any;
  });

  describe('loadModels', () => {
    it('should load models from API', async () => {
      const mockModels = {
        models: [
          { name: 'llama2' },
          { name: 'mistral' },
          { name: 'codellama' },
        ],
      };

      vi.mocked(mockApi.listModels).mockResolvedValue(mockModels as any);

      const { result } = renderHook(() => useModels(mockApi));

      await act(async () => {
        await result.current.loadModels();
      });

      expect(result.current.models).toEqual(['llama2', 'mistral', 'codellama']);
      expect(result.current.defaultModel).toBe('llama2');
    });

    it('should set default model to first model', async () => {
      const mockModels = {
        models: [
          { name: 'mistral' },
          { name: 'llama2' },
        ],
      };

      vi.mocked(mockApi.listModels).mockResolvedValue(mockModels as any);

      const { result } = renderHook(() => useModels(mockApi));

      await act(async () => {
        await result.current.loadModels();
      });

      expect(result.current.defaultModel).toBe('mistral');
    });

    it('should handle empty model list', async () => {
      const mockModels = {
        models: [],
      };

      vi.mocked(mockApi.listModels).mockResolvedValue(mockModels as any);

      const { result } = renderHook(() => useModels(mockApi));

      await act(async () => {
        await result.current.loadModels();
      });

      expect(result.current.models).toEqual([]);
      expect(result.current.defaultModel).toBe('');
    });

    it('should show error toast on API failure', async () => {
      const error = new Error('API Error');
      vi.mocked(mockApi.listModels).mockRejectedValue(error);

      const { result } = renderHook(() => useModels(mockApi));

      await act(async () => {
        await result.current.loadModels();
      });

      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          style: 'failure',
          title: 'Failed to load models',
          message: 'Error: API Error',
        })
      );
    });
  });

  describe('initial state', () => {
    it('should have empty models and defaultModel initially', () => {
      const { result } = renderHook(() => useModels(mockApi));

      expect(result.current.models).toEqual([]);
      expect(result.current.defaultModel).toBe('');
    });
  });
});

