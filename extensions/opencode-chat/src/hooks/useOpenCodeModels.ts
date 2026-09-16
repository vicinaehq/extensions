import { useEffect, useState } from "react";
import {
  fetchProviders,
  type OpenCodeProvider,
  type OpenCodeProviderList,
} from "../lib/session";

export interface ModelEntry {
  /** Full model ID in provider/model format, e.g. "anthropic/claude-sonnet-4-20250514" */
  id: string;
  /** Human-readable name, e.g. "Claude Sonnet 4" */
  name: string;
  /** Provider ID, e.g. "anthropic" */
  provider: string;
  /** Provider display name, e.g. "Anthropic" */
  providerName: string;
  /** Whether this is the default/recommended model for this provider */
  isDefault: boolean;
}

interface UseOpenCodeModelsReturn {
  models: ModelEntry[];
  providers: OpenCodeProvider[];
  defaults: Record<string, string>;
  isLoading: boolean;
}

/**
 * Fetches connected providers and their models from OpenCode's local server.
 * Returns a flat list of ModelEntry objects ready for the dropdown.
 * Default models per provider are marked and sorted first.
 */
export function useOpenCodeModels(): UseOpenCodeModelsReturn {
  const [data, setData] = useState<OpenCodeProviderList>({
    providers: [],
    defaults: {},
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const result = await fetchProviders();
      if (!cancelled) {
        setData(result);
        setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const models: ModelEntry[] = [];

  for (const provider of data.providers) {
    const defaultModelId = data.defaults[provider.id];
    const entries: ModelEntry[] = [];

    for (const [modelId, model] of Object.entries(provider.models)) {
      entries.push({
        id: `${provider.id}/${modelId}`,
        name: model.name,
        provider: provider.id,
        providerName: provider.name,
        isDefault: modelId === defaultModelId,
      });
    }

    // Sort: default first, then alphabetical by name
    entries.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });

    models.push(...entries);
  }

  return {
    models,
    providers: data.providers,
    defaults: data.defaults,
    isLoading,
  };
}
