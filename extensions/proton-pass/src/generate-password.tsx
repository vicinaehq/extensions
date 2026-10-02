import { Action, ActionPanel, Clipboard, Form, Icon, showToast, Toast } from "@vicinae/api";
import { useState } from "react";
import { generatePassword, PasswordOptions } from "./pass-cli";

type FormValues = Record<string, string | boolean | undefined>;

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export default function Command() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(values: FormValues) {
    setLoading(true);
    setError(undefined);
    try {
      const type = values.type === "passphrase" ? "passphrase" : "random";
      const options: PasswordOptions = type === "random"
        ? {
            type,
            length: integer(values.length, 20, 4, 256),
            includeNumbers: values.includeNumbers !== false,
            includeUppercase: values.includeUppercase !== false,
            includeSymbols: values.includeSymbols !== false,
          }
        : {
            type,
            words: integer(values.words, 4, 2, 12),
            separator: String(values.separator ?? "hyphens"),
            capitalize: values.capitalize !== false,
            includeNumbers: values.passphraseNumbers !== false,
          };
      setPassword(await generatePassword(options));
      await showToast({ style: Toast.Style.Success, title: "Password generated" });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!password) return;
    await Clipboard.copy(password, { concealed: true });
    await showToast({ style: Toast.Style.Success, title: "Password copied" });
  }

  return (
    <Form
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Generate Password"
            icon={Icon.Key}
            onSubmit={(values) => void submit(values as FormValues)}
          />
          {password && (
            <Action
              title="Copy Password"
              icon={Icon.CopyClipboard}
              onAction={() => void copy()}
            />
          )}
        </ActionPanel>
      }
    >
      <Form.Dropdown id="type" title="Type" defaultValue="random">
        <Form.Dropdown.Item title="Random password" value="random" />
        <Form.Dropdown.Item title="Passphrase" value="passphrase" />
      </Form.Dropdown>

      <Form.Separator />
      <Form.Description
        title="Random password options"
        text="Character count is clamped to 4–256."
      />
      <Form.TextField id="length" title="Character count" defaultValue="20" />
      <Form.Checkbox id="includeUppercase" label="Include uppercase letters" defaultValue />
      <Form.Checkbox id="includeNumbers" label="Include numbers" defaultValue />
      <Form.Checkbox id="includeSymbols" label="Include symbols" defaultValue />

      <Form.Separator />
      <Form.Description
        title="Passphrase options"
        text="Word count is clamped to 2–12."
      />
      <Form.TextField id="words" title="Word count" defaultValue="4" />
      <Form.Dropdown id="separator" title="Separator" defaultValue="hyphens">
        <Form.Dropdown.Item title="Hyphens" value="hyphens" />
        <Form.Dropdown.Item title="Spaces" value="spaces" />
        <Form.Dropdown.Item title="Underscores" value="underscores" />
        <Form.Dropdown.Item title="None" value="none" />
      </Form.Dropdown>
      <Form.Checkbox id="capitalize" label="Capitalise words" defaultValue />
      <Form.Checkbox id="passphraseNumbers" label="Include numbers" defaultValue />

      <Form.Separator />
      <Form.Description title="Generated password" text={password || "Nothing generated yet."} />
      {error && <Form.Description title="Error" text={error} />}
    </Form>
  );
}
