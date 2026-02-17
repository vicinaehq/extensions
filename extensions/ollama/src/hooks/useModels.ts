import { Toast, showToast } from '@vicinae/api';
import { useState, useCallback } from 'react';
import { OllamaAPI } from '@/api';

export function useModels(api: OllamaAPI) {
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('');

  const loadModels = useCallback(async () => {
    try {
      const response = await api.listModels();
      const modelNames = response.models.map(m => m.name);
      setModels(modelNames);
      if (modelNames.length > 0) {
        setDefaultModel(modelNames[0]);
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'Failed to load models',
        message: String(error),
      });
    }
  }, [api]);

  return {
    models,
    defaultModel,
    loadModels,
  };
}
