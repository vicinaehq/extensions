import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  openExtensionPreferences,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { fetchModels } from "../services/ollama";
import type { Mode, OllamaModel } from "../types/index";
import { getModeLabel } from "../utils/index";

export default function ModelBrowserView({
  mode,
  onSelect,
}: {
  mode: Mode;
  onSelect: (model: string) => void;
}) {
  const { pop } = useNavigation();
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const fetched = await fetchModels();
        setModels(fetched);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        setError(
          msg.includes("fetch")
            ? "Cannot reach Ollama. Make sure it's running (`ollama serve`)."
            : msg || "Failed to fetch models",
        );
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [retryCount]);

  if (error) {
    return (
      <Detail
        markdown={`## Error\n\n${error}`}
        actions={
          <ActionPanel>
            <Action
              title="Retry"
              icon={Icon.RotateAntiClockwise}
              onAction={() => setRetryCount((c) => c + 1)}
            />
            <Action
              title="Open Extension Preferences"
              icon={Icon.Cog}
              onAction={openExtensionPreferences}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List isLoading={isLoading} navigationTitle="Select Model">
      {models.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No Models Found"
          description="Pull a model with 'ollama pull <model>'"
        />
      ) : (
        models.map((model) => (
          <List.Item
            key={model.name}
            title={model.name}
            subtitle={`${(model.size / 1e9).toFixed(1)} GB`}
            accessories={[
              { text: new Date(model.modified_at).toLocaleDateString() },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title={`Use for ${getModeLabel(mode)}`}
                  icon={Icon.Checkmark}
                  onAction={() => {
                    onSelect(model.name);
                    pop();
                  }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
