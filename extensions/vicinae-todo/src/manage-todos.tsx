import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import {
  Task,
  addTask,
  deleteTask,
  getTasks,
  toIsoDate,
  todayIsoDate,
  toggleCompleted,
  updateTask,
} from "./lib/store";
import {
  GoogleConfig,
  getGoogleConfig,
  hasGoogleCredentials,
  isSignedIn,
  saveGoogleConfig,
  signOut,
} from "./lib/google-auth";
import { getLastSyncAt, syncWithGoogle } from "./lib/sync";

const AUTO_SYNC_STALE_MS = 2 * 60 * 1000;

function formatDue(due: string): string {
  const today = todayIsoDate();
  if (due === today) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (due === toIsoDate(tomorrow)) return "Tomorrow";
  return new Date(`${due}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function snoozeDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

function TaskForm(props: {
  task?: Task;
  parentId?: string;
  onSave: () => void;
}) {
  const { task, parentId, onSave } = props;
  const { pop } = useNavigation();

  async function handleSubmit(input: Form.Values) {
    const values = input as { title?: string; notes?: string; due?: Date | null };
    const title = (values.title ?? "").trim();
    if (!title) {
      await showToast({ style: Toast.Style.Failure, title: "Title is required" });
      return;
    }
    const fields = {
      title,
      notes: values.notes?.trim() || undefined,
      due: values.due ? toIsoDate(values.due) : undefined,
    };
    if (task) {
      await updateTask(task.id, fields);
    } else {
      await addTask({ ...fields, parentId });
    }
    onSave();
    pop();
  }

  return (
    <Form
      navigationTitle={task ? "Edit Todo" : parentId ? "Add Subtask" : "New Todo"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={task ? "Save Changes" : "Add Todo"}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="What needs to be done?"
        defaultValue={task?.title}
      />
      <Form.TextArea
        id="notes"
        title="Notes"
        placeholder="Optional details"
        defaultValue={task?.notes}
      />
      <Form.DatePicker
        id="due"
        title="Due Date"
        type={Form.DatePicker.Type.Date}
        defaultValue={task?.due ? new Date(`${task.due}T00:00:00`) : null}
      />
    </Form>
  );
}

function GoogleConfigForm() {
  const { pop } = useNavigation();
  const [config, setConfig] = useState<GoogleConfig | null>(null);

  useEffect(() => {
    getGoogleConfig().then(setConfig);
  }, []);

  if (!config) return <Form isLoading navigationTitle="Configure Google Sync" />;

  async function handleSubmit(input: Form.Values) {
    const values = input as { clientId?: string; clientSecret?: string; listName?: string };
    const clientId = (values.clientId ?? "").trim();
    const clientSecret = (values.clientSecret ?? "").trim();
    if (!clientId || !clientSecret) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Client ID and secret are both required",
        message: "Create a Google Cloud OAuth 'Desktop app' credential — see the README",
      });
      return;
    }
    await saveGoogleConfig({
      clientId,
      clientSecret,
      listName: (values.listName ?? "").trim() || "Vicinae",
    });
    pop();
    await showToast({
      style: Toast.Style.Success,
      title: "Google sync configured",
      message: "Press ⌘R to sync — your browser will open a consent screen once",
    });
  }

  return (
    <Form
      navigationTitle="Configure Google Sync"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Configuration" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Credentials of your own Google Cloud OAuth 'Desktop app' client (setup steps in the README). They are stored in Vicinae's local database, never sent anywhere except to Google." />
      <Form.TextField
        id="clientId"
        title="OAuth Client ID"
        placeholder="xxxx.apps.googleusercontent.com"
        defaultValue={config.clientId}
      />
      <Form.PasswordField
        id="clientSecret"
        title="OAuth Client Secret"
        placeholder="GOCSPX-…"
        defaultValue={config.clientSecret}
      />
      <Form.TextField
        id="listName"
        title="Google Tasks List Name"
        placeholder="Vicinae"
        defaultValue={config.listName}
      />
    </Form>
  );
}

interface Row {
  task: Task;
  isSubtask: boolean;
  subtaskCount?: number;
}

function buildSections(tasks: Task[]): { title: string; rows: Row[] }[] {
  const today = todayIsoDate();
  const active = tasks.filter((t) => !t.completed);
  const activeIds = new Set(active.map((t) => t.id));
  const childrenOf = (id: string) => active.filter((t) => t.parentId === id);

  // Tasks whose parent is missing or inactive are promoted to top level.
  const topLevel = active.filter((t) => !t.parentId || !activeIds.has(t.parentId));

  const buckets: Record<string, Row[]> = {
    Overdue: [],
    Today: [],
    Upcoming: [],
    "No Date": [],
  };
  for (const task of topLevel) {
    const bucket = !task.due
      ? "No Date"
      : task.due < today
        ? "Overdue"
        : task.due === today
          ? "Today"
          : "Upcoming";
    const subtasks = childrenOf(task.id);
    buckets[bucket].push({ task, isSubtask: false, subtaskCount: subtasks.length });
    for (const sub of subtasks) {
      buckets[bucket].push({ task: sub, isSubtask: true });
    }
  }
  buckets.Overdue.sort((a, b) => (a.task.due ?? "").localeCompare(b.task.due ?? ""));
  buckets.Upcoming.sort((a, b) => (a.task.due ?? "").localeCompare(b.task.due ?? ""));

  const completed = tasks
    .filter((t) => t.completed)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .map((task): Row => ({ task, isSubtask: false }));

  return [
    { title: "Overdue", rows: buckets.Overdue },
    { title: "Today", rows: buckets.Today },
    { title: "Upcoming", rows: buckets.Upcoming },
    { title: "No Date", rows: buckets["No Date"] },
    { title: "Completed", rows: completed },
  ].filter((s) => s.rows.length > 0);
}

export default function ManageTodos() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setTasks(await getTasks());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await reload();
      // Opportunistic background sync — only if already signed in, so we
      // never pop a browser consent screen unprompted.
      if (
        (await hasGoogleCredentials()) &&
        (await isSignedIn()) &&
        Date.now() - (await getLastSyncAt()) > AUTO_SYNC_STALE_MS
      ) {
        try {
          await syncWithGoogle();
          await reload();
        } catch {
          // Silent — manual Sync Now surfaces errors.
        }
      }
    })();
  }, [reload]);

  async function handleSync() {
    if (!(await hasGoogleCredentials())) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Google sync not configured",
        message: "Use the Configure Google Sync action first (setup steps in the README)",
      });
      return;
    }
    const toast = await showToast({ style: Toast.Style.Animated, title: "Syncing with Google Tasks…" });
    try {
      const { pushed, pulled, deleted } = await syncWithGoogle();
      await reload();
      toast.style = Toast.Style.Success;
      toast.title = "Synced";
      toast.message = `${pushed} pushed, ${pulled} pulled, ${deleted} deleted`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Sync failed";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function handleSignOut() {
    await signOut();
    await showToast({ style: Toast.Style.Success, title: "Signed out of Google" });
  }

  async function handleToggle(task: Task) {
    const updated = await toggleCompleted(task.id);
    await reload();
    await showToast({
      style: Toast.Style.Success,
      title: updated?.completed ? "Completed" : "Reopened",
      message: task.title,
    });
  }

  async function handleSnooze(task: Task, days: number, label: string) {
    await updateTask(task.id, { due: snoozeDate(days) });
    await reload();
    await showToast({ style: Toast.Style.Success, title: `Snoozed to ${label}` });
  }

  async function handleDelete(task: Task) {
    await deleteTask(task.id);
    await reload();
    await showToast({ style: Toast.Style.Success, title: "Deleted", message: task.title });
  }

  const newTodoAction = (
    <Action.Push
      title="New Todo"
      icon={Icon.Plus}
      shortcut={{ modifiers: ["cmd"], key: "n" }}
      target={<TaskForm onSave={reload} />}
    />
  );

  const googleSection = (
    <ActionPanel.Section title="Google Tasks">
      <Action
        title="Sync with Google Tasks"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={handleSync}
      />
      <Action.Push
        title="Configure Google Sync"
        icon={Icon.Cog}
        shortcut={{ modifiers: ["cmd", "shift"], key: "g" }}
        target={<GoogleConfigForm />}
      />
      <Action title="Sign Out of Google" icon={Icon.Logout} onAction={handleSignOut} />
    </ActionPanel.Section>
  );

  const sections = buildSections(tasks);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search todos…">
      <List.EmptyView
        title="No todos yet"
        description="Press Enter to create your first todo."
        icon={Icon.CheckCircle}
        actions={
          <ActionPanel>
            {newTodoAction}
            {googleSection}
          </ActionPanel>
        }
      />
      {sections.map((section) => (
        <List.Section key={section.title} title={section.title}>
          {section.rows.map(({ task, isSubtask, subtaskCount }) => {
            const accessories: List.Item.Accessory[] = [];
            if (subtaskCount) {
              accessories.push({ text: `${subtaskCount} subtask${subtaskCount > 1 ? "s" : ""}` });
            }
            if (task.due && !task.completed) {
              const overdue = task.due < todayIsoDate();
              accessories.push({
                tag: { value: formatDue(task.due), color: overdue ? Color.Red : Color.SecondaryText },
              });
            }
            return (
              <List.Item
                key={task.id}
                title={(isSubtask ? "↳ " : "") + task.title}
                subtitle={task.notes}
                icon={
                  task.completed
                    ? { source: Icon.CheckCircle, tintColor: Color.Green }
                    : Icon.Circle
                }
                accessories={accessories}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action
                        title={task.completed ? "Mark as Not Completed" : "Mark as Completed"}
                        icon={task.completed ? Icon.Circle : Icon.CheckCircle}
                        onAction={() => handleToggle(task)}
                      />
                      <Action.Push
                        title="Edit Todo"
                        icon={Icon.Pencil}
                        shortcut={{ modifiers: ["cmd"], key: "e" }}
                        target={<TaskForm task={task} onSave={reload} />}
                      />
                      {!task.completed && !isSubtask && (
                        <Action.Push
                          title="Add Subtask"
                          icon={Icon.PlusCircle}
                          shortcut={{ modifiers: ["cmd"], key: "s" }}
                          target={<TaskForm parentId={task.id} onSave={reload} />}
                        />
                      )}
                    </ActionPanel.Section>
                    {!task.completed && (
                      <ActionPanel.Section title="Snooze">
                        <Action
                          title="Snooze to Tomorrow"
                          icon={Icon.ArrowClockwise}
                          shortcut={{ modifiers: ["cmd"], key: "t" }}
                          onAction={() => handleSnooze(task, 1, "tomorrow")}
                        />
                        <Action
                          title="Snooze to Next Week"
                          icon={Icon.Calendar}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
                          onAction={() => handleSnooze(task, 7, "next week")}
                        />
                      </ActionPanel.Section>
                    )}
                    <ActionPanel.Section>
                      {newTodoAction}
                      <Action
                        title="Delete Todo"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["ctrl"], key: "x" }}
                        onAction={() => handleDelete(task)}
                      />
                    </ActionPanel.Section>
                    {googleSection}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}
