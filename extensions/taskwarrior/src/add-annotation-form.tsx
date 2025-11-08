import React, { useState } from "react";
import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  popToRoot,
} from "@vicinae/api";
import { Task } from "./types";
import { runTaskCommand } from "./utils";

interface AddAnnotationFormProps {
  task: Task;
  onAnnotationAdded?: () => void;
}

export default function AddAnnotationForm({
  task,
  onAnnotationAdded,
}: AddAnnotationFormProps) {
  const [annotation, setAnnotation] = useState("");

  async function handleSubmit(values: any) {
    if (!values.annotation.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Annotation cannot be empty",
      });
      return;
    }

    try {
      await runTaskCommand(`${task.id} annotate ${values.annotation}`);

      showToast({
        style: Toast.Style.Success,
        title: "Annotation added successfully",
      });

      onAnnotationAdded?.();
      popToRoot();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to add annotation",
        message: "Make sure Taskwarrior is installed and configured",
      });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Annotation" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="annotation"
        title="Annotation"
        value={annotation}
        onChange={setAnnotation}
      />
    </Form>
  );
}
