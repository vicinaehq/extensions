import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Model, ModelHook } from "../type";

type StoredModel = Partial<Model> & Pick<Model, "id">;

// Default Bedrock model IDs
const DEFAULT_BEDROCK_MODELS: string[] = [
  "us.anthropic.claude-opus-4-6-v1",
  "us.anthropic.claude-sonnet-4-6",
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "moonshotai.kimi-k2.5",
  "zai.glm-5",
];

export const DEFAULT_MODEL: Model = {
  id: "default",
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  name: "Default",
  prompt: "You are a helpful assistant.",
  option: "us.anthropic.claude-opus-4-6-v1",
  temperature: "1",
  pinned: false,
  vision: false,
};

function normalizeModel(model: StoredModel): Model {
  const now = new Date().toISOString();
  return {
    ...DEFAULT_MODEL,
    ...model,
    id: model.id,
    created_at: model.created_at ?? now,
    updated_at: model.updated_at ?? now,
    temperature: String(model.temperature ?? DEFAULT_MODEL.temperature),
    vision: model.vision ?? false,
    pinned: model.pinned ?? false,
  };
}

function normalizeModels(models: Record<string, StoredModel>): Record<string, Model> {
  const normalized = Object.values(models).reduce<Record<string, Model>>((acc, model) => {
    acc[model.id] = normalizeModel(model);
    return acc;
  }, {});
  if (!normalized[DEFAULT_MODEL.id]) {
    normalized[DEFAULT_MODEL.id] = DEFAULT_MODEL;
  }
  return normalized;
}

const CUSTOM_MODEL_IDS_KEY = "custom-model-ids";

export function useModel(): ModelHook {
  const [data, setData] = useState<Record<string, Model>>({});
  const [isLoading, setLoading] = useState<boolean>(true);
  const [customModelIds, setCustomModelIds] = useState<string[]>([]);
  const isInitialMount = useRef(true);

  // Combined option list: hardcoded defaults + user-added custom IDs
  const option = useMemo(() => {
    const allIds = [...DEFAULT_BEDROCK_MODELS, ...customModelIds];
    // Deduplicate while preserving order
    return [...new Set(allIds)];
  }, [customModelIds]);

  // Load models and custom model IDs from LocalStorage
  useEffect(() => {
    (async () => {
      // Load custom model IDs
      const storedCustomIds = await LocalStorage.getItem<string>(CUSTOM_MODEL_IDS_KEY);
      if (storedCustomIds) {
        try {
          setCustomModelIds(JSON.parse(storedCustomIds));
        } catch {
          // ignore parse errors
        }
      }

      // Load models
      const storedModels: StoredModel[] | Record<string, StoredModel> = JSON.parse(
        (await LocalStorage.getItem<string>("models")) || "{}",
      );
      const storedModelsLength = ((models: Record<string, StoredModel> | StoredModel[]): number =>
        Array.isArray(models) ? models.length : Object.keys(models).length)(storedModels);

      if (storedModelsLength === 0) {
        setData({ [DEFAULT_MODEL.id]: DEFAULT_MODEL });
      } else {
        let modelsById: Record<string, StoredModel>;
        // Support for old data structure
        if (Array.isArray(storedModels)) {
          modelsById = storedModels.reduce((acc, model) => ({ ...acc, [model.id]: model }), {});
        } else {
          modelsById = storedModels;
        }
        setData(normalizeModels(modelsById));
      }
      setLoading(false);
      isInitialMount.current = false;
    })();
  }, []);

  useEffect(() => {
    // Avoid saving when initial loading
    if (isInitialMount.current) {
      return;
    }
    LocalStorage.setItem("models", JSON.stringify(data));
  }, [data]);

  // Persist custom model IDs
  useEffect(() => {
    if (isInitialMount.current) {
      return;
    }
    LocalStorage.setItem(CUSTOM_MODEL_IDS_KEY, JSON.stringify(customModelIds));
  }, [customModelIds]);

  const add = useCallback(
    async (model: Model) => {
      const toast = await showToast({
        title: "Saving your model...",
        style: Toast.Style.Animated,
      });
      setData((prevData) => ({
        ...prevData,
        [model.id]: normalizeModel({ ...model, created_at: new Date().toISOString() }),
      }));
      toast.title = "Model saved!";
      toast.style = Toast.Style.Success;
    },
    [setData],
  );

  const update = useCallback(
    async (model: Model) => {
      const toast = await showToast({
        title: "Updating your model...",
        style: Toast.Style.Animated,
      });
      setData((prevData) => ({
        ...prevData,
        [model.id]: normalizeModel({
          ...prevData[model.id],
          ...model,
          updated_at: new Date().toISOString(),
        }),
      }));
      toast.title = "Model updated!";
      toast.style = Toast.Style.Success;
    },
    [setData],
  );

  const remove = useCallback(
    async (model: Model) => {
      const toast = await showToast({
        title: "Removing your model...",
        style: Toast.Style.Animated,
      });
      setData((prevData) => {
        const newData = { ...prevData };
        delete newData[model.id];
        return newData;
      });
      toast.title = "Model removed!";
      toast.style = Toast.Style.Success;
    },
    [setData],
  );

  const clear = useCallback(async () => {
    const toast = await showToast({
      title: "Clearing your models ...",
      style: Toast.Style.Animated,
    });
    setData({ [DEFAULT_MODEL.id]: DEFAULT_MODEL });
    toast.title = "Models cleared!";
    toast.style = Toast.Style.Success;
  }, [setData]);

  const setModels = useCallback(
    async (models: Record<string, Model>) => {
      setData(normalizeModels(models));
    },
    [setData],
  );

  const addCustomModelId = useCallback(
    async (modelId: string) => {
      const trimmed = modelId.trim();
      if (trimmed && !DEFAULT_BEDROCK_MODELS.includes(trimmed)) {
        setCustomModelIds((prev) => {
          if (prev.includes(trimmed)) return prev;
          return [...prev, trimmed];
        });
        await showToast({
          title: "Model ID added!",
          message: trimmed,
          style: Toast.Style.Success,
        });
      }
    },
    [],
  );

  const removeCustomModelId = useCallback(
    async (modelId: string) => {
      setCustomModelIds((prev) => prev.filter((id) => id !== modelId));
      await showToast({
        title: "Model ID removed!",
        message: modelId,
        style: Toast.Style.Success,
      });
    },
    [],
  );

  return useMemo(
    () => ({ data, isLoading, option, add, update, remove, clear, setModels, addCustomModelId, removeCustomModelId }),
    [data, isLoading, option, add, update, remove, clear, setModels, addCustomModelId, removeCustomModelId],
  );
}
