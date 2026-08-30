import { useState } from "react";
import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { updateCommand } from "../utils/storage";
import type { CustomCommand } from "../types";

interface Props {
  command: CustomCommand;
  onUpdated: (cmd: CustomCommand) => void;
}

export function EditCommandForm({ command, onUpdated }: Props) {
  const { pop } = useNavigation();
  const [nameError, setNameError] = useState<string | undefined>();
  const [commandError, setCommandError] = useState<string | undefined>();

  async function handleSubmit(values: Form.Values) {
    const name = (values.name as string)?.trim();
    const cmdStr = (values.command as string)?.trim();
    const description = (values.description as string)?.trim();
    const workdir = (values.workdir as string)?.trim();
    const icon = (values.icon as string)?.trim();
    const group = (values.group as string)?.trim();
    const terminal = Boolean(values.terminal);

    if (!name) {
      setNameError("Name is required");
      return;
    }
    setNameError(undefined);
    if (!cmdStr) {
      setCommandError("Command is required");
      return;
    }
    setCommandError(undefined);

    const updated = await updateCommand(command.id, {
      name,
      command: cmdStr,
      description,
      workdir,
      terminal,
      icon,
      group,
    });
    if (!updated) {
      await showToast({ style: Toast.Style.Failure, title: "Not found", message: "Command may have been deleted" });
      pop();
      return;
    }
    await showToast({ style: Toast.Style.Success, title: "Command updated", message: name });
    onUpdated(updated);
    pop();
  }

  return (
    <Form
      navigationTitle={`Edit: ${command.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Changes" icon={Icon.Check} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue={command.name} error={nameError} onChange={() => setNameError(undefined)} />
      <Form.TextArea
        id="command"
        title="Command"
        defaultValue={command.command}
        error={commandError}
        onChange={() => setCommandError(undefined)}
        info="Dynamic: {{name}} for inputs ({{host}}, {{msg}}...), system: {{clipboard}}, {{home}}, {{user}}, {{date}}, {{time}}, {{datetime}}"
      />
      <Form.TextField id="description" title="Description" defaultValue={command.description} />
      <Form.TextField id="workdir" title="Working Directory" defaultValue={command.workdir} />
      <Form.TextField
        id="icon"
        title="Icon"
        placeholder="https://example.com/icon.png or /home/user/.icons/foo.svg"
        defaultValue={command.icon ?? ""}
        info="URL or local file path (png/svg/webp/ico). Leave empty for default."
      />
      <Form.TextField id="group" title="Group" placeholder="e.g. git, docker" defaultValue={command.group ?? ""} />
      <Form.Checkbox id="terminal" title="Run in Terminal" label="Open in terminal window" defaultValue={command.terminal} />
    </Form>
  );
}
