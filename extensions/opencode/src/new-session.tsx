import { Action, ActionPanel, Form, useNavigation } from "@vicinae/api";
import { useMemo, useState, type ReactNode } from "react";
import type { Config } from "./lib/config";
import { useOpenCodeCommand } from "./components/command-gate";
import { createOpenCodeService } from "./lib/opencode/client";
import type { Endpoint } from "./lib/opencode/discovery";
import type { ModelRef, Project, SessionInfo } from "./lib/opencode/types";
import { modelValue, parseModelRef, useModels } from "./lib/models";
import { showActionError, SentView } from "./components/actions";
import { ModelPickerList } from "./components/model-picker";
import { modelLabel } from "./components/model-dropdown";
import { ProjectPickerList, basename } from "./components/project-picker";

/**
 * New Session flow: pick a project, optionally enter a prompt, create the
 * session through the OpenCode V2 API, then open it in the TUI.
 */
export function NewSessionFlow(props: {
  readonly endpoint: Endpoint;
  readonly config: Config;
  readonly initialProject?: Project;
}): ReactNode {
  const { push } = useNavigation();
  if (props.initialProject) {
    return (
      <NewSessionPromptStep
        endpoint={props.endpoint}
        config={props.config}
        project={props.initialProject}
      />
    );
  }
  return (
    <ProjectPickerList
      endpoint={props.endpoint}
      onPick={(picked) =>
        push(<NewSessionPromptStep endpoint={props.endpoint} config={props.config} project={picked} />)
      }
      navigationTitle="New Session"
    />
  );
}

function NewSessionPromptStep(props: {
  readonly endpoint: Endpoint;
  readonly config: Config;
  readonly project: Project;
}): ReactNode {
  const { push } = useNavigation();
  const [model, setModel] = useState<ModelRef | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<SessionInfo | undefined>(undefined);
  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);
  const { models, defaultModelID } = useModels(props.endpoint);

  // The model that will be used: explicitly chosen, or OpenCode's default.
  const activeModelId = model ? modelValue(model) : defaultModelID;
  const knownActiveModelId =
    activeModelId && models.some((candidate) => modelValue(candidate) === activeModelId)
      ? activeModelId
      : undefined;

  const handleSubmit = async (values: { readonly prompt?: string }) => {
    if (busy) return;
    const text = (values.prompt ?? "").trim();
    setBusy(true);
    try {
      const session = await service.createSession({
        directory: props.project.canonical,
        ...(model ? { model } : {}),
      });
      if (text) await service.sendPrompt(session.id, text);
      setCreated(session);
    } catch (error) {
      await showActionError(error, "Failed to create session");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <SentView
        title={created.title || "Session created"}
        description="Open it in Terminal to follow along."
        sessionID={created.id}
        directory={created.location?.directory}
        config={props.config}
        againTitle="New Session"
        onAgain={() => setCreated(undefined)}
      />
    );
  }

  return (
    <Form
      navigationTitle="New Session"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Session"
            icon="speech-bubble"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={handleSubmit}
          />
          <Action
            title="Choose Model"
            icon="bolt"
            shortcut={{ modifiers: ["cmd"], key: "m" }}
            onAction={() => push(<ModelPickerList endpoint={props.endpoint} onPick={setModel} />)}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea id="prompt" title="Prompt" placeholder="Optional first prompt" autoFocus />
      <Form.Description text={`Project: ${basename(props.project.canonical)}`} />
      {models.length > 0 && knownActiveModelId ? (
        <Form.Dropdown
          id="model"
          title="Model"
          value={knownActiveModelId}
          onChange={(value) => setModel(parseModelRef(value))}
          filtering
        >
          {models.map((candidate) => {
            const value = modelValue(candidate);
            return (
              <Form.Dropdown.Item key={value} value={value} title={modelLabel(candidate)} keywords={[value]} />
            );
          })}
        </Form.Dropdown>
      ) : activeModelId ? (
        <Form.Description text={`Model: ${activeModelId}${model ? "" : " (default)"}`} />
      ) : null}
    </Form>
  );
}

export default function NewSessionCommand(): ReactNode {
  const command = useOpenCodeCommand();
  if (!command.ready) return command.view;
  return <NewSessionFlow endpoint={command.endpoint} config={command.config} />;
}
