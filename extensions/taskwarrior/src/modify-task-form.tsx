import React, { useState, useEffect } from "react";
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

interface ModifyTaskFormProps {
  task: Task;
  onTaskModified?: () => void;
}

export default function ModifyTaskForm({
  task,
  onTaskModified,
}: ModifyTaskFormProps) {
  const [description, setDescription] = useState(task.description);
  const [project, setProject] = useState(task.project || "");
  const [tags, setTags] = useState(task.tags ? task.tags.join(", ") : "");
  const [due, setDue] = useState(task.due || "");
  const [priority, setPriority] = useState(task.priority || "");

  async function handleSubmit(values: any) {
    try {
      let command = `${task.id} modify ${values.description}`;

      const modifications: string[] = [];

      if (values.project !== (task.project || "")) {
        modifications.push(`project:${values.project || ""}`);
      }

      if (values.due !== (task.due || "")) {
        modifications.push(`due:${values.due || ""}`);
      }

      if (values.priority !== (task.priority || "")) {
        modifications.push(`priority:${values.priority || ""}`);
      }

      // Handle tags - this is more complex as we need to remove old tags and add new ones
      const currentTags = task.tags || [];
      const newTags = values.tags
        .split(",")
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag);

      const tagsToRemove = currentTags.filter(
        (tag: string) => !newTags.includes(tag),
      );
      const tagsToAdd = newTags.filter(
        (tag: string) => !currentTags.includes(tag),
      );

      tagsToRemove.forEach((tag: string) => modifications.push(`-${tag}`));
      tagsToAdd.forEach((tag: string) => modifications.push(`+${tag}`));

      if (modifications.length > 0) {
        command += ` ${modifications.join(" ")}`;
      }

      await runTaskCommand(command);

      showToast({
        style: Toast.Style.Success,
        title: "Task modified successfully",
      });

      onTaskModified?.();
      popToRoot();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to modify task",
        message: "Make sure Taskwarrior is installed and configured",
      });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Modify Task" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="description"
        title="Description"
        value={description}
        onChange={setDescription}
      />
      <Form.TextField
        id="project"
        title="Project"
        value={project}
        onChange={setProject}
      />
      <Form.TextField id="tags" title="Tags" value={tags} onChange={setTags} />
      <Form.TextField id="due" title="Due Date" value={due} onChange={setDue} />
      <Form.Dropdown
        id="priority"
        title="Priority"
        value={priority}
        onChange={setPriority}
      >
        <Form.Dropdown.Item value="" title="None" />
        <Form.Dropdown.Item value="H" title="High" />
        <Form.Dropdown.Item value="M" title="Medium" />
        <Form.Dropdown.Item value="L" title="Low" />
      </Form.Dropdown>
    </Form>
  );
}
