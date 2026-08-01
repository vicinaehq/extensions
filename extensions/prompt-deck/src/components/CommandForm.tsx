import { Action, ActionPanel, Form, Icon, useNavigation } from "@vicinae/api";
import { showFailureToast } from "../lib/feedback";
import { trimText } from "../lib/string";
import type { CommandFormValues, ContextBlock, ContextSource } from "../lib/types";
import { ContextPreviewDescription } from "./ContextPreview";

interface CommandFormProps {
  navigationTitle: string;
  submitTitle: string;
  onSubmit: (command: string, includedSources?: ContextSource[]) => void;
  /** Prefills the command field, e.g. to retry a failed run without retyping. */
  initialCommand?: string | undefined;
  contextBlocks?: ContextBlock[] | undefined;
  /** Renders an include-checkbox per context block so blocks can be dropped before sending. */
  selectableContext?: boolean | undefined;
  includeConversationNote?: boolean | undefined;
  popCountOnSubmit?: number;
}

/**
 * Small command entry form used for both first-run prompts and follow-up replies.
 */
export function CommandForm({
  navigationTitle,
  submitTitle,
  onSubmit,
  initialCommand,
  contextBlocks = [],
  selectableContext = false,
  includeConversationNote = false,
  popCountOnSubmit = 0,
}: CommandFormProps) {
  const { pop } = useNavigation();
  const contextNote = includeConversationNote ? "(Previous messages in this chat will be included.)" : undefined;
  const showsCheckboxes = selectableContext && contextBlocks.length > 0;

  return (
    <Form
      navigationTitle={navigationTitle}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={submitTitle}
            icon={Icon.Play}
            onSubmit={async (values) => {
              const input = values as CommandFormValues;
              const command = trimText(input.command);
              if (!command) {
                await showFailureToast("Command is required");
                return false;
              }

              const includedSources = showsCheckboxes
                ? contextBlocks
                    .filter((block) => (values as Record<string, unknown>)[`include-${block.source}`] !== false)
                    .map((block) => block.source)
                : undefined;

              for (let index = 0; index < popCountOnSubmit; index += 1) {
                pop();
              }
              onSubmit(command, includedSources);
              return true;
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="command"
        title="Command"
        placeholder="What should the model do?"
        defaultValue={initialCommand ?? ""}
        autoFocus
      />
      {showsCheckboxes ? (
        <>
          <Form.Separator />
          {contextBlocks.map((block) => (
            <Form.Checkbox
              key={block.source}
              id={`include-${block.source}`}
              title={block.title}
              label="Send with command"
              defaultValue
            />
          ))}
        </>
      ) : null}
      <ContextPreviewDescription contextBlocks={contextBlocks} note={contextNote} />
    </Form>
  );
}
