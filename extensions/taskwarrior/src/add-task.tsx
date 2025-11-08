import { LaunchProps, showToast, Toast, closeMainWindow } from "@vicinae/api";
import { runTaskCommand } from "./utils";

interface AddTaskArgs {
  description: string;
}

export default async function AddTask(
  props: LaunchProps<{ arguments: AddTaskArgs }>,
) {
  const { description } = props.arguments;

  try {
    await runTaskCommand(`add ${description}`);
    showToast({
      style: Toast.Style.Success,
      title: "Task added successfully",
      message: description,
    });
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to add task",
      message: "Make sure Taskwarrior is installed and configured",
    });
  }

  closeMainWindow();
}
