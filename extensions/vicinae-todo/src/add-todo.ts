import { LaunchProps, Toast, showToast } from "@vicinae/api";
import { parseQuickAdd } from "./lib/parse";
import { addTask } from "./lib/store";

export default async function AddTodo(
  props: LaunchProps<{ arguments: { text: string } }>,
) {
  const { title, due, dueTime } = parseQuickAdd(props.arguments.text ?? "");

  if (!title) {
    await showToast({ style: Toast.Style.Failure, title: "Nothing to add" });
    return;
  }

  await addTask({ title, due, dueTime });
  await showToast({
    style: Toast.Style.Success,
    title: `Added "${title}"`,
    message: due ? `Due ${due}${dueTime ? ` at ${dueTime}` : ""}` : undefined,
  });
}
