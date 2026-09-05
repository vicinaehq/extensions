import { useState } from "react";
import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { addCommand } from "../utils/storage";
import type { CustomCommand } from "../types";

interface Props {
  onCreated: (cmd: CustomCommand) => void;
}

export function AddCommandForm({ onCreated }: Props) {
  const { pop } = useNavigation();
  const [nameError, setNameError] = useState<string | undefined>();
  const [commandError, setCommandError] = useState<string | undefined>();

  async function handleSubmit(values: Form.Values) {
    const name = (values.name as string)?.trim();
    const command = (values.command as string)?.trim();
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
    if (!command) {
      setCommandError("Command is required");
      return;
    }
    setCommandError(undefined);

    try {
      const created = await addCommand({ name, command, description, workdir, terminal, icon, group });
      await showToast({ style: Toast.Style.Success, title: "Command created", message: name });
      onCreated(created);
      pop();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to create",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <Form
      navigationTitle="Add Custom Command"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Command" icon={Icon.Plus} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" placeholder="e.g. Update system" error={nameError} onChange={() => setNameError(undefined)} />
      <Form.TextArea
        id="command"
        title="Command"
        placeholder="e.g. git commit -m {{msg}}  or  ssh {{host}}  or  echo {{clipboard}}"
        error={commandError}
        onChange={() => setCommandError(undefined)}
        info="Use {{name}} for inputs (e.g. {{host}}, {{branch}}, {{msg}}) and system: {{clipboard}}, {{home}}, {{user}}, {{date}}, {{time}}, {{datetime}}."
      />
      <Form.TextField id="description" title="Description" placeholder="Optional description" />
      <Form.TextField id="workdir" title="Working Directory" placeholder="Optional, e.g. /home/user/projects" />
      <Form.TextField
        id="icon"
        title="Icon"
        placeholder="https://example.com/icon.png or /home/user/.icons/foo.svg or ~/icons/icon.png"
        info="URL or local file path (png/svg/webp/ico). Leave empty for default terminal icon."
      />
      <Form.TextField id="group" title="Group" placeholder="e.g. git, docker, system (leave empty for Ungrouped)" />
      <Form.Checkbox id="terminal" title="Run in Terminal" label="Open in terminal window" defaultValue={false} />
      <Form.Description text="Examples: code {{path}}, scp {{file}} {{host}}:/tmp, curl {{url}} | jq, date {{date}} - {{clipboard}}" />
      <Form.Description text="Background: output copied to clipboard. Terminal: opens in configured terminal (Preferences → Terminal)." />
    </Form>
  );
}
