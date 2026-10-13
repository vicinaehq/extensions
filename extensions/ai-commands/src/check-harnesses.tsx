import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  openExtensionPreferences,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  HARNESS_IDS,
  HARNESS_NAMES,
  errorMessage,
  isApiHarness,
  type HarnessId,
  type ModelInfo,
} from "./core/types";
import { plainTextMarkdown } from "./core/template";
import { discoverModels } from "./harnesses";
import { connectionFor } from "./vicinae";

type Status = { path?: string; models?: ModelInfo[]; error?: string };
export default function CheckHarnesses() {
  const [statuses, setStatuses] = useState<Partial<Record<HarnessId, Status>>>(
    {},
  );
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatuses({});
    for (const harness of HARNESS_IDS)
      void (async () => {
        let status: Status;
        try {
          const connection = await connectionFor(harness);
          status = {
            path: connection.executable,
            models: await discoverModels(
              harness,
              connection,
              controller.signal,
            ),
          };
        } catch (error) {
          status = { error: errorMessage(error) };
        }
        if (!controller.signal.aborted)
          setStatuses((previous) => ({ ...previous, [harness]: status }));
      })();
    return () => controller.abort();
  }, [refresh]);
  return (
    <List
      navigationTitle="Check AI Harnesses"
      isLoading={Object.keys(statuses).length < HARNESS_IDS.length}
    >
      {HARNESS_IDS.map((harness) => {
        const status = statuses[harness];
        const description =
          status?.error ??
          (status?.models
            ? `${status.models.length} models available`
            : "Checking…");
        const markdown = status?.error
          ? plainTextMarkdown(status.error)
          : status?.models
            ? plainTextMarkdown(
                `${isApiHarness(harness) ? "Direct connection using the API key in extension preferences." : `Executable: ${status.path}`}\n\n${status.models.map((model) => `${model.name}
Model ID: ${model.id}\nThinking: ${model.efforts.join(", ") || "provider default"}${model.effortInfo ? `\n${model.effortInfo}` : ""}`).join("\n\n")}\n\nA catalog check does not make a generation request. ${isApiHarness(harness) ? "Generation uses the provider's API billing." : "Connect or sign in to the CLI if generation asks for authentication."}`,
              )
            : "Checking…";
        return (
          <List.Item
            key={harness}
            title={HARNESS_NAMES[harness]}
            subtitle={description}
            icon={
              status?.error
                ? Icon.Exclamationmark
                : status?.models
                  ? Icon.CheckCircle
                  : Icon.Clock
            }
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  target={<Detail markdown={markdown} />}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  onAction={() => setRefresh((value) => value + 1)}
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
      })}
    </List>
  );
}
