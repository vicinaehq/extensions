import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@vicinae/api";
import { useState } from "react";

import { isExistingFile, pathFromFormValue } from "@/utils/paths";

interface ImportSettingsFormProps {
  onImport: (filePath: string) => Promise<boolean>;
}

export default function ImportSettingsForm({ onImport }: ImportSettingsFormProps) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(values: Form.Values) {
    const filePath = pathFromFormValue(values.file);
    if (!filePath) {
      setError("Required");
      return;
    }

    if (!isExistingFile(filePath)) {
      setError("File not found");
      await showToast({
        message: filePath,
        style: Toast.Style.Failure,
        title: "Settings file not found",
      });
      return;
    }

    const imported = await onImport(filePath);
    if (imported) {
      pop();
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Import">
            <Action.SubmitForm onSubmit={handleSubmit} title="Import Settings" />
          </ActionPanel.Section>
        </ActionPanel>
      }
      navigationTitle="Import Settings"
    >
      <Form.Description
        text="Paste the full path to your JSON backup. You can copy it from Finder or your file manager."
        title="How to Import"
      />
      <Form.TextField
        error={error}
        id="file"
        onChange={() => setError(undefined)}
        placeholder="~/Downloads/workspace-settings.json"
        title="Settings File Path"
      />
    </Form>
  );
}
