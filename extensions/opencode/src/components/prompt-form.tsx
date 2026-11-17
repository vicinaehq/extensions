import { Action, ActionPanel, Form, Toast, showToast, useNavigation } from "@vicinae/api";
import { useMemo, useState, type ReactNode } from "react";
import { createOpenCodeService } from "../lib/opencode/client";
import type { Endpoint } from "../lib/opencode/discovery";
import type { Config } from "../lib/config";
import type { SessionInfo } from "../lib/opencode/types";
import { isSameModelRef, modelValue, parseModelRef, useModels } from "../lib/models";
import { showActionError, OpenSessionAction, SentView } from "./actions";
import { ModelPickerList } from "./model-picker";
import { modelLabel } from "./model-dropdown";

/** Form shown after "Send Prompt" on a session, with model selection. */
export function PromptForm(props: {
  readonly endpoint: Endpoint;
  readonly config: Config;
  readonly session: SessionInfo;
}): ReactNode {
  const { push } = useNavigation();
  const [sent, setSent] = useState(false);
  const [model, setModel] = useState<string | undefined>(undefined);
  const { models, defaultModelID } = useModels(props.endpoint);
  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);

  const known = (value: string | undefined): boolean =>
    value !== undefined && models.some((model) => modelValue(model) === value);
  const sessionValue = props.session.model ? modelValue(props.session.model) : undefined;
  const firstValue = models[0] ? modelValue(models[0]) : undefined;
  const initialModel = known(sessionValue)
    ? sessionValue
    : known(defaultModelID)
      ? defaultModelID
      : firstValue;

  // Explicitly chosen model, else the session or default model.
  const activeModel = model ?? initialModel;

  const handleSubmit = async (values: { readonly prompt?: string }) => {
    const text = (values.prompt ?? "").trim();
    if (!text) return;
    try {
      // Sending with a different model switches the session first. This
      // matches picking a model in the OpenCode TUI.
      const selected = activeModel ? parseModelRef(activeModel) : undefined;
      if (selected && !isSameModelRef(selected, props.session.model ?? undefined)) {
        await service.switchModel(props.session.id, selected);
      }
      await service.sendPrompt(props.session.id, text);
    } catch (error) {
      await showActionError(error, "Failed to send prompt");
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <SentView
        title="Prompt sent"
        description={`OpenCode will pick it up in "${props.session.title}".`}
        sessionID={props.session.id}
        directory={props.session.location?.directory}
        config={props.config}
      />
    );
  }

  return (
    <Form
      navigationTitle="Send Prompt"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send Prompt"
            icon="speech-bubble"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={handleSubmit}
          />
          <Action
            title="Choose Model"
            icon="bolt"
            shortcut={{ modifiers: ["cmd"], key: "m" }}
            onAction={() =>
              push(
                <ModelPickerList
                  endpoint={props.endpoint}
                  onPick={(picked) => setModel(modelValue(picked))}
                />,
              )
            }
          />
          <OpenSessionAction
            sessionID={props.session.id}
            directory={props.session.location?.directory}
            config={props.config}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder="Message to send to this session"
        autoFocus
      />
      <Form.Description text={`Session: ${props.session.title || props.session.id}`} />
      {models.length > 0 && activeModel ? (
        <Form.Dropdown id="model" title="Model" value={activeModel} onChange={setModel} filtering>
          {models.map((model) => {
            const value = modelValue(model);
            return (
              <Form.Dropdown.Item key={value} value={value} title={modelLabel(model)} keywords={[value]} />
            );
          })}
        </Form.Dropdown>
      ) : sessionValue ? (
        <Form.Description text={`Model: ${sessionValue}`} />
      ) : null}
    </Form>
  );
}

/** Form shown after "Rename" on a session. */
export function RenameSessionForm(props: {
  readonly endpoint: Endpoint;
  readonly session: SessionInfo;
  readonly onRenamed: () => void;
}): ReactNode {
  const { pop } = useNavigation();
  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);

  const handleSubmit = async (values: { readonly title?: string }) => {
    const title = (values.title ?? "").trim();
    if (!title) return;
    try {
      await service.renameSession(props.session.id, title);
    } catch (error) {
      await showActionError(error, "Failed to rename session");
      return;
    }
    await showToast({ style: Toast.Style.Success, title: "Session renamed" });
    props.onRenamed();
    pop();
  };

  return (
    <Form
      navigationTitle="Rename Session"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Rename"
            icon="text"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" defaultValue={props.session.title ?? ""} autoFocus />
    </Form>
  );
}
