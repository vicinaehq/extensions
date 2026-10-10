import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  openExtensionPreferences,
  popToRoot,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SYSTEM_PROMPT,
  HARNESS_IDS,
  HARNESS_NAMES,
  errorMessage,
  type AICommand,
  type HarnessId,
  type ModelInfo,
} from "../core/types";
import { discoverModels } from "../harnesses";
import { launcherEnabled } from "../core/launcher-paths";
import { plainTextMarkdown } from "../core/template";
import {
  connectionFor,
  publishCommand,
  repository,
  toastError,
} from "../vicinae";

import SetupAICommands from "../setup-ai-commands";

export function CommandForm({
  command,
  duplicate = false,
  onSave,
}: {
  command?: AICommand;
  duplicate?: boolean;
  onSave?: (command: AICommand) => void;
}) {
  const name = command ? command.name + (duplicate ? " Copy" : "") : "";
  const prompt =
    command?.prompt ??
    "Translate into English. Return only the translated text.\n\n{selection}";
  const systemPrompt = command?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const rootSearchReady = process.platform === "linux" && launcherEnabled();
  const [harness, setHarness] = useState<HarnessId>(
    command?.harness ?? "claude",
  );
  const [model, setModel] = useState(command?.model ?? "");
  const [effort, setEffort] = useState(command?.effort ?? "");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelError, setModelError] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0);
  const { push } = useNavigation();
  const saving = useRef(false);
  const persistedCommand = useRef<AICommand | undefined>(
    duplicate ? undefined : command,
  );

  function clearError(field: string) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setModelError(undefined);
    setModels([]);
    void (async () => {
      try {
        const found = await discoverModels(
          harness,
          await connectionFor(harness),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setModels(found);
        clearError("model");
        clearError("effort");
        setModel(
          (previous) =>
            previous || (found.find((item) => item.isDefault) ?? found[0]!).id,
        );
      } catch (error) {
        if (!controller.signal.aborted) setModelError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [harness, refresh]);

  const selectedModel = models.find((item) => item.id === model);
  const efforts = selectedModel?.efforts ?? [];

  async function save(formValues: Form.Values) {
    if (saving.current) return;
    const name = typeof formValues.name === "string" ? formValues.name : "";
    const prompt =
      typeof formValues.prompt === "string" ? formValues.prompt : "";
    const systemPrompt =
      typeof formValues.systemPrompt === "string"
        ? formValues.systemPrompt
        : "";
    const submittedModel =
      typeof formValues.model === "string" ? formValues.model : model;
    const submittedEffort =
      typeof formValues.effort === "string" ? formValues.effort : effort;
    const currentModel = models.find((item) => item.id === submittedModel);
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Give the command a name.";
    if (!prompt.trim())
      nextErrors.prompt = "Write the transformation instruction.";
    if (!currentModel)
      nextErrors.model = loading
        ? "Wait for the model list to load."
        : "Select an available model. Refresh the list if needed.";
    if (submittedEffort && !currentModel?.efforts.includes(submittedEffort))
      nextErrors.effort = "Choose a thinking level supported by this model.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    saving.current = true;
    try {
      const result = await repository.saveCommand(
        {
          name,
          prompt,
          systemPrompt,
          harness,
          model: submittedModel,
          effort: submittedEffort,
        },
        persistedCommand.current,
      );
      persistedCommand.current = result;
      let publicationError: string | undefined;
      if (rootSearchReady) {
        try {
          await publishCommand(result);
        } catch (error) {
          publicationError = errorMessage(error);
        }
      }
      onSave?.(result);
      if (publicationError || !rootSearchReady)
        push(
          <SavedCommand
            command={result}
            publicationError={publicationError}
            needsSetup={!rootSearchReady}
          />,
        );
      else {
        await showToast({
          style: Toast.Style.Success,
          title: "Command added to main search",
          message: result.name,
        });
        await popToRoot({ clearSearchBar: true });
      }
    } catch (error) {
      await toastError(error, "Could not save command");
    } finally {
      saving.current = false;
    }
  }

  return (
    <Form
      navigationTitle={
        command && !duplicate ? "Edit AI Command" : "Create AI Command"
      }
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Command"
            icon={Icon.Check}
            onSubmit={save}
          />
          <Action
            title="Refresh Models"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["ctrl"], key: "r" }}
            onAction={() => setRefresh((value) => value + 1)}
          />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Cog}
            onAction={openExtensionPreferences}
          />
          {!rootSearchReady && (
            <Action.Push
              title="Setup AI Commands"
              target={<SetupAICommands />}
            />
          )}
        </ActionPanel>
      }
    >
      {!rootSearchReady && (
        <Form.Description
          title="Root search"
          text="Saved commands run from AI Commands. Open Setup AI Commands to give each command its own root-search entry."
        />
      )}
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Translate to English"
        defaultValue={name}
        error={errors.name}
        onChange={() => clearError("name")}
        autoFocus
      />
      <Form.Dropdown
        id="harness"
        title="Harness / API"
        value={harness}
        onChange={(value) => {
          setHarness(value as HarnessId);
          setModel("");
          setEffort("");
          setErrors({});
        }}
      >
        {HARNESS_IDS.map((id) => (
          <Form.Dropdown.Item key={id} value={id} title={HARNESS_NAMES[id]} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="model"
        title="Model"
        value={model}
        onChange={(value) => {
          setModel(value);
          setEffort("");
          clearError("model");
          clearError("effort");
        }}
        isLoading={loading}
        error={errors.model ?? modelError}
        info={selectedModel?.description}
      >
        {!model && (
          <Form.Dropdown.Item
            value=""
            title={loading ? "Loading models…" : "Select a model"}
          />
        )}
        {model && !models.some((item) => item.id === model) && (
          <Form.Dropdown.Item value={model} title={`${model} (saved)`} />
        )}
        {models.map((item) => (
          <Form.Dropdown.Item key={item.id} value={item.id} title={item.name} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="effort"
        title="Thinking"
        value={effort}
        onChange={(value) => {
          setEffort(value);
          clearError("effort");
        }}
        error={errors.effort}
        info={
          selectedModel?.effortInfo ??
          (!loading && !efforts.length
            ? "This model does not expose configurable thinking levels."
            : undefined)
        }
      >
        <Form.Dropdown.Item value="" title="Provider default" />
        {effort && !efforts.includes(effort) && (
          <Form.Dropdown.Item
            value={effort}
            title={`${effort} (unavailable)`}
          />
        )}
        {efforts.map((value) => (
          <Form.Dropdown.Item
            key={value}
            value={value}
            title={value.charAt(0).toUpperCase() + value.slice(1)}
          />
        ))}
      </Form.Dropdown>
      <Form.TextArea
        id="prompt"
        title="Prompt"
        defaultValue={prompt}
        error={errors.prompt}
        onChange={() => clearError("prompt")}
        info="Use {selection} for highlighted text or {clipboard} for copied text. These are replaced when the command runs."
      />
      <Form.TextArea
        id="systemPrompt"
        title="System instruction"
        defaultValue={systemPrompt}
        info="General rules for the answer, such as plain text, tone, and punctuation."
      />
    </Form>
  );
}

function SavedCommand({
  command,
  publicationError,
  needsSetup,
}: {
  command: AICommand;
  publicationError?: string;
  needsSetup: boolean;
}) {
  const [error, setError] = useState(publicationError);
  const message = needsSetup
    ? "Your command is saved. Run it from AI Commands, or open Setup AI Commands below to give it its own root-search entry."
    : error
      ? `Your command is saved, but its root-search entry could not be updated. Fix the problem below, then retry.\n\n${error}`
      : "Find this command by name in root search. Select text in an app, run the command, and press Enter to paste the result.";
  return (
    <Detail
      navigationTitle="Command Saved"
      markdown={plainTextMarkdown(`${command.name}\n\n${message}`)}
      actions={
        <ActionPanel>
          {needsSetup && (
            <Action.Push
              title="Setup AI Commands"
              target={<SetupAICommands />}
            />
          )}
          {error && !needsSetup ? (
            <Action
              title="Retry Adding to Main Search"
              icon={Icon.ArrowClockwise}
              onAction={async () => {
                try {
                  await publishCommand(command);
                  setError(undefined);
                } catch (error) {
                  setError(errorMessage(error));
                }
              }}
            />
          ) : (
            <Action
              title="Back to Main Search"
              icon={Icon.ArrowLeft}
              onAction={() => popToRoot({ clearSearchBar: true })}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
