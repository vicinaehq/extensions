import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import {
  errorMessage,
  HARNESS_NAMES,
  type AICommand,
  type InputSnapshot,
} from "../core/types";
import {
  inputSources,
  plainTextMarkdown,
  refinementPrompt,
  renderTemplate,
} from "../core/template";
import { runHarness } from "../harnesses";
import {
  connectionFor,
  pasteToSource,
  repository,
  toastError,
  type Preferences,
  type SourceContext,
} from "../vicinae";

type Execution = { prompt: string; attempt: number };
type ResultState = {
  status: "loading" | "ready" | "error";
  text: string;
  error?: string;
};

export function RunView({
  command,
  context,
}: {
  command: AICommand;
  context: SourceContext;
}) {
  const [execution, setExecution] = useState<Execution>({
    prompt: "",
    attempt: 0,
  });
  const [state, setState] = useState<ResultState>({
    status: "loading",
    text: "",
  });
  const { push } = useNavigation();
  const [previous, setPrevious] = useState<{ text: string; prompt: string }>();
  const controller = useRef<AbortController | undefined>(undefined);
  const pasteBusy = useRef(false);
  const basePrompt = useRef("");

  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    setState({ status: "loading", text: "" });
    void (async () => {
      // Deferring one microtask prevents a StrictMode mount/cleanup cycle
      // from spending a second generation on the same command.
      await Promise.resolve();
      if (active.signal.aborted) return;
      try {
        if (!basePrompt.current)
          basePrompt.current = renderTemplate(command.prompt, context.input);
        const prompt = execution.prompt || basePrompt.current;
        const connection = await connectionFor(command.harness);
        if (active.signal.aborted) return;
        const result = await runHarness({
          command,
          prompt,
          ...connection,
          signal: active.signal,
          onText: (text) => {
            if (!active.signal.aborted) setState({ status: "loading", text });
          },
        });
        if (active.signal.aborted) return;
        setState({ status: "ready", text: result });
        if (getPreferenceValues<Preferences>().saveHistory !== false) {
          const usedInput: InputSnapshot = {};
          for (const source of inputSources(command.prompt))
            usedInput[source] = context.input[source];
          try {
            await repository.saveHistory({
              command,
              input: usedInput,
              renderedPrompt: prompt,
              result,
            });
          } catch (error) {
            if (!active.signal.aborted)
              await toastError(
                error,
                "Result ready; history could not be saved",
              );
          }
        }
      } catch (error) {
        if (!active.signal.aborted)
          setState({ status: "error", text: "", error: errorMessage(error) });
      }
    })();
    return () => active.abort();
  }, [command, context, execution]);

  async function paste() {
    if (state.status !== "ready" || pasteBusy.current) return;
    pasteBusy.current = true;
    try {
      await pasteToSource(state.text, context);
    } catch (error) {
      await toastError(error, "Could not paste result");
    } finally {
      pasteBusy.current = false;
    }
  }

  function cancel() {
    controller.current?.abort();
    setState({
      status: "error",
      text: "",
      error: "Generation cancelled. Your source text has not been changed.",
    });
  }

  function refine(values: Form.Values): boolean {
    try {
      const prompt = refinementPrompt(
        basePrompt.current,
        state.text,
        String(values.instruction ?? ""),
      );
      setPrevious({ text: state.text, prompt: execution.prompt });
      setExecution((current) => ({ prompt, attempt: current.attempt + 1 }));
      return true;
    } catch (error) {
      void toastError(error);
      return false;
    }
  }

  const markdown =
    state.status === "error"
      ? `Could not complete the command.\n\n${plainTextMarkdown(state.error ?? "Unknown error")}`
      : state.text
        ? plainTextMarkdown(state.text)
        : "Generating…";
  return (
    <Detail
      navigationTitle={`${state.status === "loading" ? "Generating… · " : ""}${command.name} · ${HARNESS_NAMES[command.harness]} · ${command.model}`}
      markdown={markdown}
      actions={
        <ActionPanel>
          {state.status === "ready" ? (
            <>
              <Action
                title="Paste to Source App"
                icon={Icon.CopyClipboard}
                onAction={paste}
              />
              <Action.CopyToClipboard
                title="Copy Result"
                content={state.text}
                shortcut={{ modifiers: ["ctrl"], key: "c" }}
              />
              <Action
                title="Refine Result"
                icon={Icon.Stars}
                shortcut={{ modifiers: ["ctrl"], key: "r" }}
                onAction={() => push(<RefineForm onRefine={refine} />)}
              />
            </>
          ) : state.status === "loading" ? (
            <>
              <Action
                title="Generating…"
                icon={Icon.Stars}
                onAction={() => {}}
              />
              <Action
                title="Cancel Generation"
                icon={Icon.XMarkCircle}
                shortcut={{ modifiers: ["ctrl"], key: "." }}
                onAction={cancel}
              />
            </>
          ) : (
            <>
              {basePrompt.current && (
                <Action
                  title="Retry"
                  icon={Icon.ArrowClockwise}
                  onAction={() =>
                    setExecution((value) => ({
                      ...value,
                      attempt: value.attempt + 1,
                    }))
                  }
                />
              )}
              <Action
                title="Open Extension Preferences"
                icon={Icon.Cog}
                onAction={openExtensionPreferences}
              />
            </>
          )}
          {previous && state.status !== "loading" && (
            <Action
              title="Restore Previous Result"
              icon={Icon.Undo}
              onAction={() => {
                controller.current?.abort();
                setState({ status: "ready", text: previous.text });
                setPrevious(undefined);
                void showToast({
                  style: Toast.Style.Success,
                  title: "Previous result restored",
                });
              }}
            />
          )}
        </ActionPanel>
      }
    />
  );
}

function RefineForm({
  onRefine,
}: {
  onRefine: (values: Form.Values) => boolean;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Refine Result"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Refine"
            icon={Icon.Stars}
            onSubmit={(values) => {
              if (onRefine(values)) pop();
            }}
          />
          <Action title="Back to Result" icon={Icon.ArrowLeft} onAction={pop} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="instruction"
        title="Instruction"
        placeholder="Make it sound more natural. Avoid long dashes."
        autoFocus
      />
    </Form>
  );
}
