import { useState, useEffect, useCallback } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  useNavigation,
  Form,
} from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "util";
import { ensureGogInstalled, useGogAccounts } from "./utils";

const execAsync = promisify(exec);

interface TaskList {
  id: string;
  title: string;
  updated: string;
  etag?: string;
  kind?: string;
  selfLink?: string;
}

interface Task {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  updated?: string;
  position?: string;
  etag?: string;
  kind?: string;
  selfLink?: string;
  webViewLink?: string;
  parent?: string;
  completed?: string;
  deleted?: boolean;
  hidden?: boolean;
}

interface TasksListsResponse {
  tasklists: TaskList[];
  nextPageToken?: string;
}

interface TasksResponse {
  tasks: Task[];
  nextPageToken?: string;
}

interface EditTaskFormProps {
  account: string;
  taskListId: string;
  task: Task;
  onComplete: () => void;
}

function EditTaskForm({
  account,
  taskListId,
  task,
  onComplete,
}: EditTaskFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Check}
            title="Update Task"
            onSubmit={async (values) => {
              try {
                const { title, notes, due } = values as {
                  title: string;
                  notes?: string;
                  due?: string;
                };
                let cmd = `gog tasks update --account "${account}" ${taskListId} ${task.id}`;
                cmd += ` --title "${title}"`;
                cmd += ` --notes "${notes || ""}"`;
                if (due) cmd += ` --due "${due}"`;
                await execAsync(cmd);
                showToast({ title: "Task updated" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to update task",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" defaultValue={task.title} />
      <Form.TextArea id="notes" title="Notes" defaultValue={task.notes || ""} />
      <Form.TextField
        id="due"
        title="Due Date"
        defaultValue={task.due?.split("T")[0] || ""}
      />
    </Form>
  );
}

interface AccountTaskLists {
  [email: string]: TaskList[];
}

export default function Tasks() {
  const [accountTaskLists, setAccountTaskLists] = useState<AccountTaskLists>(
    {},
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedList, setSelectedList] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [account, setAccount] = useState<string>("");
  const { accounts } = useGogAccounts();
  const { push } = useNavigation();

  // Current account's task lists
  const taskLists = accountTaskLists[account] || [];

  // Load task lists for all accounts
  const loadAllTaskLists = useCallback(async () => {
    if (!(await ensureGogInstalled())) return;
    if (accounts.length === 0) return;

    const allLists: AccountTaskLists = {};
    for (const acc of accounts) {
      try {
        const { stdout } = await execAsync(
          `gog tasks lists list --account "${acc.email}" --json`,
        );
        const data: TasksListsResponse = JSON.parse(stdout);
        allLists[acc.email] = data.tasklists || [];
      } catch (error) {
        console.error(`Error loading task lists for ${acc.email}:`, error);
        allLists[acc.email] = [];
      }
    }
    setAccountTaskLists(allLists);

    // Set default account and list if not set
    if (!account && accounts.length > 0) {
      const firstAccount = accounts[0]!.email;
      setAccount(firstAccount);
      const firstList = allLists[firstAccount]?.[0];
      if (firstList) {
        setSelectedList(firstList.id);
      }
    }
  }, [accounts, account]);

  // Load task lists when accounts change
  useEffect(() => {
    if (accounts.length > 0) {
      loadAllTaskLists();
    }
  }, [accounts]);

  // Load tasks when selected list changes
  const loadTasks = useCallback(async () => {
    if (!selectedList || !account) return;
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const accountArg = `--account "${account}"`;
      const { stdout } = await execAsync(
        `gog tasks list ${selectedList} ${accountArg} --show-completed --max 100 --json`,
      );
      const data: TasksResponse = JSON.parse(stdout);
      setTasks(data.tasks || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Error loading tasks",
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedList, account]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const toggleTask = async (task: Task) => {
    if (!account) return;
    try {
      const accountArg = `--account "${account}"`;
      const cmd =
        task.status === "completed"
          ? `gog tasks undo ${selectedList} ${task.id} ${accountArg}`
          : `gog tasks done ${selectedList} ${task.id} ${accountArg}`;
      await execAsync(cmd);
      showToast({
        title: task.status === "completed" ? "Marked incomplete" : "Completed",
      });
      await loadTasks();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed", style: Toast.Style.Failure });
    }
  };

  const deleteTask = async (task: Task) => {
    if (!account) return;
    try {
      const accountArg = `--account "${account}"`;
      await execAsync(
        `gog tasks delete ${selectedList} ${task.id} ${accountArg} --force`,
      );
      showToast({ title: "Task deleted" });
      await loadTasks();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed to delete", style: Toast.Style.Failure });
    }
  };

  const clearCompleted = async () => {
    if (!account) return;
    try {
      const accountArg = `--account "${account}"`;
      await execAsync(`gog tasks clear ${selectedList} ${accountArg}`);
      showToast({ title: "Cleared completed tasks" });
      await loadTasks();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed to clear", style: Toast.Style.Failure });
    }
  };

  const quickAddTask = async (title: string) => {
    if (!title.trim() || !selectedList || !account) return;
    try {
      const accountArg = `--account "${account}"`;
      await execAsync(
        `gog tasks add ${selectedList} ${accountArg} --title "${title.trim()}"`,
      );
      showToast({ title: "Task added" });
      setSearchText("");
      await loadTasks();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed to add task", style: Toast.Style.Failure });
    }
  };

  const quickCreateList = async (title: string) => {
    if (!title.trim() || !account) return;
    try {
      const accountArg = `--account "${account}"`;
      await execAsync(`gog tasks lists create "${title.trim()}" ${accountArg}`);
      showToast({ title: "Task list created" });
      setSearchText("");
      await loadAllTaskLists();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed to create list", style: Toast.Style.Failure });
    }
  };

  // Filter and sort: incomplete first, then by due date
  const filteredTasks = tasks.filter((task) => {
    if (!searchText.trim()) return true;
    const search = searchText.toLowerCase();
    return (
      task.title.toLowerCase().includes(search) ||
      task.notes?.toLowerCase().includes(search)
    );
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "needsAction" ? -1 : 1;
    }
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });

  const selectedTaskList = taskLists.find((l) => l.id === selectedList);
  const pendingCount = filteredTasks.filter(
    (t) => t.status === "needsAction",
  ).length;
  const completedCount = filteredTasks.filter(
    (t) => t.status === "completed",
  ).length;

  const globalActions = (
    <ActionPanel>
      {searchText.trim() && selectedTaskList && (
        <Action
          title={`Add Task "${searchText.trim()}"`}
          icon={Icon.Plus}
          onAction={() => quickAddTask(searchText)}
        />
      )}
      {searchText.trim() && (
        <Action
          title={`Create List "${searchText.trim()}"`}
          icon={Icon.PlusCircle}
          shortcut={{ modifiers: ["shift"], key: "enter" }}
          onAction={() => quickCreateList(searchText)}
        />
      )}
      <Action
        title="Refresh"
        icon={Icon.RotateClockwise}
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={loadTasks}
      />
      {completedCount > 0 && (
        <Action
          title="Clear Completed"
          icon={Icon.Trash}
          onAction={clearCompleted}
        />
      )}
    </ActionPanel>
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Type to search or add task..."
      filtering={false}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Account & List"
          value={`${account}|${selectedList}`}
          onChange={(value) => {
            const [acc, listId] = value.split("|");
            if (acc && listId) {
              setAccount(acc);
              setSelectedList(listId);
            }
          }}
        >
          {accounts.map((acc) => {
            const lists = accountTaskLists[acc.email] || [];
            return (
              <List.Dropdown.Section key={acc.email} title={acc.email}>
                {lists.length > 0 ? (
                  lists.map((list) => (
                    <List.Dropdown.Item
                      key={`${acc.email}|${list.id}`}
                      title={list.title}
                      value={`${acc.email}|${list.id}`}
                    />
                  ))
                ) : (
                  <List.Dropdown.Item
                    key={`${acc.email}|none`}
                    title="No task lists"
                    value={`${acc.email}|`}
                  />
                )}
              </List.Dropdown.Section>
            );
          })}
        </List.Dropdown>
      }
      actions={globalActions}
    >
      {sortedTasks.length === 0 && !isLoading ? (
        <List.EmptyView
          title={searchText.trim() ? `Add "${searchText.trim()}"` : "No Tasks"}
          description={
            searchText.trim()
              ? "Press Enter to add task, Shift+Enter to create list"
              : selectedTaskList
                ? `No tasks in "${selectedTaskList.title}"`
                : "Type to add a task"
          }
          icon={Icon.CheckCircle}
          actions={globalActions}
        />
      ) : (
        <List.Section
          title={`${pendingCount} pending, ${completedCount} completed`}
        >
          {sortedTasks.map((task) => {
            const isCompleted = task.status === "completed";
            const dueDate = task.due?.split("T")[0];
            const today = new Date().toISOString().split("T")[0] || "";
            const isOverdue = dueDate && !isCompleted && dueDate < today;
            const isDueToday = dueDate === today;

            return (
              <List.Item
                key={task.id}
                title={task.title}
                subtitle={task.notes || ""}
                accessories={[
                  ...(isOverdue
                    ? [{ tag: { value: "Overdue", color: "#ef4444" } }]
                    : []),
                  ...(isDueToday && !isCompleted
                    ? [{ tag: { value: "Today", color: "#f59e0b" } }]
                    : []),
                  ...(dueDate && !isOverdue && !isDueToday
                    ? [{ text: dueDate, tooltip: `Due: ${dueDate}` }]
                    : []),
                  ...(isCompleted
                    ? [{ icon: Icon.Check, tooltip: "Completed" }]
                    : []),
                ]}
                icon={isCompleted ? Icon.CheckCircle : Icon.Circle}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action
                        title={
                          isCompleted ? "Mark Incomplete" : "Mark Complete"
                        }
                        icon={isCompleted ? Icon.Circle : Icon.CheckCircle}
                        onAction={() => toggleTask(task)}
                      />
                      {task.webViewLink && (
                        <Action.OpenInBrowser
                          title="Open in Google Tasks"
                          icon={Icon.Link}
                          url={task.webViewLink}
                        />
                      )}
                      <Action
                        title="Edit Task"
                        icon={Icon.Pencil}
                        onAction={() =>
                          push(
                            <EditTaskForm
                              account={account}
                              taskListId={selectedList}
                              task={task}
                              onComplete={loadTasks}
                            />,
                          )
                        }
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="Delete Task"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["shift"], key: "delete" }}
                        onAction={() => deleteTask(task)}
                      />
                    </ActionPanel.Section>
                    {searchText.trim() && (
                      <ActionPanel.Section title="Quick Add">
                        <Action
                          title={`Add Task "${searchText.trim()}"`}
                          icon={Icon.Plus}
                          onAction={() => quickAddTask(searchText)}
                        />
                        <Action
                          title={`Create List "${searchText.trim()}"`}
                          icon={Icon.PlusCircle}
                          shortcut={{ modifiers: ["shift"], key: "enter" }}
                          onAction={() => quickCreateList(searchText)}
                        />
                      </ActionPanel.Section>
                    )}
                    <ActionPanel.Section>
                      <Action
                        title="Refresh"
                        icon={Icon.RotateClockwise}
                        shortcut={{ modifiers: ["ctrl"], key: "r" }}
                        onAction={loadTasks}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
