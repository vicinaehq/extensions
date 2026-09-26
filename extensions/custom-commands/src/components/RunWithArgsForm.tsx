import { Action, ActionPanel, Form, useNavigation } from "@vicinae/api";
import { executeCustomCommand, extractPlaceholders, isSystemPlaceholder } from "../utils/exec";
import type { CustomCommand } from "../types";

interface Props {
  command: CustomCommand;
}

function labelFor(key: string): string {
  const lower = key.toLowerCase();
  if (lower === "args") return "Arguments";
  if (lower === "clipboard") return "Clipboard (auto)";
  return key;
}

function placeholderFor(key: string): string {
  const lower = key.toLowerCase();
  if (lower === "args") return "Value for {{args}}";
  if (lower === "file" || lower === "path") return "e.g. ~/projects/myapp";
  if (lower === "host") return "e.g. example.com";
  if (lower === "branch") return "e.g. main";
  if (lower === "msg" || lower === "message") return "Commit message";
  if (lower === "url") return "https://...";
  if (lower === "query" || lower === "q") return "Search query";
  return `Value for {{${key}}}`;
}

export function RunWithArgsForm({ command }: Props) {
  const { pop } = useNavigation();
  const placeholders = extractPlaceholders(command.command);
  const userKeys = placeholders.filter((k) => !isSystemPlaceholder(k));
  const systemOnly = userKeys.length === 0 && placeholders.length > 0;

  async function handleSubmit(values: Form.Values) {
    const vals: Record<string, string> = {};
    for (const k of userKeys) {
      vals[k] = (values[k] as string) ?? "";
    }
    await executeCustomCommand({
      command: command.command,
      workdir: command.workdir,
      terminal: command.terminal,
      values: vals,
      args: vals["args"],
    });
    pop();
  }

  if (systemOnly) {
    return (
      <Form
        navigationTitle={`Run: ${command.name}`}
        actions={
          <ActionPanel>
            <Action.SubmitForm title="Run Command" onSubmit={handleSubmit} />
          </ActionPanel>
        }
      >
        <Form.Description text={`Command: ${command.command}`} />
        <Form.Description text="System placeholders ({{clipboard}}, {{date}}, etc.) will be auto-filled." />
        {command.workdir ? <Form.Description text={`Working dir: ${command.workdir}`} /> : null}
      </Form>
    );
  }

  return (
    <Form
      navigationTitle={`Run: ${command.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run Command" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {userKeys.map((key) => (
        <Form.TextField
          key={key}
          id={key}
          title={labelFor(key)}
          placeholder={placeholderFor(key)}
          autoFocus={key === userKeys[0]}
        />
      ))}
      <Form.Separator />
      <Form.Description text={`Command: ${command.command}`} />
      <Form.Description text="Tip: use {{name}} for custom inputs, plus {{clipboard}}, {{home}}, {{user}}, {{date}}, {{time}}, {{datetime}} auto-filled." />
      {command.workdir ? <Form.Description text={`Working dir: ${command.workdir}`} /> : null}
    </Form>
  );
}
