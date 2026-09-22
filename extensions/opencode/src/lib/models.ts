import { useEffect, useState } from "react";
import { createOpenCodeService } from "./opencode/client";
import type { Endpoint } from "./opencode/discovery";
import type { ModelInfo, ModelRef } from "./opencode/types";

/** Canonical "providerID/modelID" dropdown value for a model reference. */
export function modelValue(model: Pick<ModelRef, "providerID" | "id">): string {
  return `${model.providerID}/${model.id}`;
}

/** Split a "providerID/modelID" dropdown value back into a model reference. */
export function parseModelRef(value: string): ModelRef | undefined {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return undefined;
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) };
}

export function isSameModelRef(a: ModelRef | undefined, b: ModelRef | undefined): boolean {
  if (!a || !b) return false;
  return a.providerID === b.providerID && a.id === b.id;
}

export interface ModelsState {
  readonly models: ModelInfo[];
  readonly defaultModelID: string | undefined;
  /** The model list could not be loaded. */
  readonly failed: boolean;
}

const EMPTY_MODELS: ModelsState = { models: [], defaultModelID: undefined, failed: false };

/** Load the model list and OpenCode's default model for the lifetime of a view. */
export function useModels(endpoint: Endpoint): ModelsState {
  const [state, setState] = useState<ModelsState>(EMPTY_MODELS);

  useEffect(() => {
    const controller = new AbortController();
    const service = createOpenCodeService(endpoint);
    void (async () => {
      try {
        const [list, fallback] = await Promise.all([
          service.models(),
          service.defaultModel().catch(() => null),
        ]);
        if (controller.signal.aborted) return;
        setState({
          models: list,
          defaultModelID: fallback ? modelValue(fallback) : undefined,
          failed: false,
        });
      } catch {
        if (!controller.signal.aborted) setState({ ...EMPTY_MODELS, failed: true });
      }
    })();
    return () => controller.abort();
  }, [endpoint]);

  return state;
}
