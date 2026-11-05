import { Action, ActionPanel, Form, Icon, popToRoot, showToast, Toast, useNavigation } from "@vicinae/api";
import path from "path";
import { useMemo, useState } from "react";

import { useWorkspace } from "@/hooks/useWorkspace";
import { isExistingDirectory, pathFromFormValue } from "@/utils/paths";
import { suggestedWorkspacePaths } from "@/utils/suggestions";

interface AddWorkspaceFormProps {
  onDone?: () => Promise<void> | void;
}

export default function AddWorkspaceForm({ onDone }: AddWorkspaceFormProps) {
  const { pop } = useNavigation();
  const { updateWorkspaces, workspaces } = useWorkspace();
  const [error, setError] = useState<string | undefined>();
  const suggestions = useMemo(() => suggestedWorkspacePaths(workspaces), [workspaces]);

  async function addWorkspace(workspacePath: string) {
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

  async function handleSubmit(values: Form.Values) {
    const workspacePath = pathFromFormValue(values.workspace);
    if (!workspacePath) {
      setError("Required");
      return;
    }

    await addWorkspace(workspacePath);
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Workspace">
            <Action.SubmitForm icon={Icon.Folder} onSubmit={handleSubmit} title="Add Workspace" />
          </ActionPanel.Section>
          {suggestions.length > 0 ? (
            <ActionPanel.Section title="Suggestions">
              {suggestions.map((suggestion) => (
                <Action
                  key={suggestion}
                  icon={Icon.Folder}
                  onAction={() => addWorkspace(suggestion)}
                  title={`Add ${path.basename(suggestion)}`}
                />
              ))}
            </ActionPanel.Section>
          ) : null}
        </ActionPanel>
      }
      navigationTitle="Add Workspace"
    >
      <Form.Description
        text="Pick a parent folder that contains your projects. Scan depth and ignore patterns in Settings control what is listed."
        title="How It Works"
      />
      {suggestions.length > 0 ? (
        <Form.Description
          text={`Found on this machine: ${suggestions.map((suggestion) => path.basename(suggestion)).join(", ")}. Use the action panel to add one quickly.`}
          title="Suggestions"
        />
      ) : null}
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
