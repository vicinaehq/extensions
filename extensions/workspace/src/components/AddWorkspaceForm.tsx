import { Action, ActionPanel, Form, popToRoot, showToast, Toast, useNavigation } from "@vicinae/api";
import path from "path";
import { useState } from "react";

import { useWorkspace } from "@/hooks/useWorkspace";
import { isExistingDirectory, pathFromFormValue } from "@/utils/paths";

interface AddWorkspaceFormProps {
  onDone?: () => Promise<void> | void;
}

export default function AddWorkspaceForm({ onDone }: AddWorkspaceFormProps) {
  const { pop } = useNavigation();
  const { updateWorkspaces, workspaces } = useWorkspace();
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(values: Form.Values) {
    const workspacePath = pathFromFormValue(values.workspace);
    if (!workspacePath) {
      setError("Required");
      return;
    }

    if (!isExistingDirectory(workspacePath)) {
      setError("Folder not found");
      await showToast({
        message: workspacePath,
        style: Toast.Style.Failure,
        title: "Folder not found",
      });
      return;
    }

    if (workspaces.includes(workspacePath)) {
      await showToast({
        message: path.basename(workspacePath),
        style: Toast.Style.Failure,
        title: "Workspace already added",
      });
      return;
    }

    await updateWorkspaces([...workspaces, workspacePath]);
    await showToast({
      message: path.basename(workspacePath),
      style: Toast.Style.Success,
      title: "Workspace Added",
    });

    if (onDone) {
      await onDone();
    }

    try {
      pop();
    } catch {
      popToRoot();
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Workspace">
            <Action.SubmitForm onSubmit={handleSubmit} title="Add Workspace" />
          </ActionPanel.Section>
        </ActionPanel>
      }
      navigationTitle="Add Workspace"
    >
      <Form.Description
        text="Pick a parent folder that contains your projects. Each top-level folder inside it becomes a project."
        title="How It Works"
      />
      <Form.FilePicker
        canChooseDirectories
        canChooseFiles={false}
        error={error}
        id="workspace"
        onChange={() => setError(undefined)}
        title="Workspace Folder"
      />
    </Form>
  );
}
