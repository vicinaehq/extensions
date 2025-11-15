import React, { useState, useEffect, useCallback } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  getPreferenceValues,
  showToast,
  Toast,
  popToRoot,
  closeMainWindow,
  useNavigation,
  LocalStorage,
} from "@vicinae/api";

import ModifyTaskForm from "./modify-task-form";
import AddAnnotationForm from "./add-annotation-form";
import { Task, Preferences } from "./types";
import {
  runTaskCommand,
  parseTaskwarriorDate,
  formatDate,
  getPriorityIcon,
} from "./utils";

async function getTasks(view: string = "next"): Promise<Task[]> {
  try {
    const output = await runTaskCommand(`export ${view}`);
    const tasks = JSON.parse(output);
    // Filter out deleted tasks as they cannot be deleted again
    return tasks.filter((task: Task) => task.status !== "deleted");
  } catch (error) {
    console.error("Failed to get tasks:", error);
    return [];
  }
}

export default function TaskManager() {
  const { push } = useNavigation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<string>("next");
  const [showDetails, setShowDetails] = useState(false);

  // Load initial states from LocalStorage
  useEffect(() => {
    // Load showDetails
    LocalStorage.getItem("taskwarrior-show-details").then((value) => {
      if (typeof value === "string" && value !== "undefined") {
        try {
          setShowDetails(JSON.parse(value));
        } catch (error) {
          // If parsing fails, use default value (false)
          console.warn("Failed to parse showDetails from LocalStorage:", error);
        }
      }
    });

    // Load currentView - if saved value exists, use it; otherwise use preference default
    LocalStorage.getItem("taskwarrior-current-view").then((value) => {
      if (typeof value === "string" && value !== "undefined") {
        setCurrentView(value);
      } else {
        // No saved view, use preference default
        setCurrentView(preferences["default-view"]);
      }
    });
  }, []);

  // Function to update showDetails and persist to LocalStorage
  const updateShowDetails = useCallback((newValue: boolean) => {
    setShowDetails(newValue);
    LocalStorage.setItem("taskwarrior-show-details", JSON.stringify(newValue));
  }, []);

  // Function to update currentView and persist to LocalStorage
  const updateCurrentView = useCallback((newValue: string) => {
    setCurrentView(newValue);
    LocalStorage.setItem("taskwarrior-current-view", newValue);
  }, []);
  const preferences = getPreferenceValues<Preferences>();

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const taskData = await getTasks(currentView);
      // Sort by urgency descending (highest first)
      taskData.sort((a, b) => b.urgency - a.urgency);
      setTasks(taskData);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load tasks",
        message: "Make sure Taskwarrior is installed and configured",
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentView]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function completeTask(taskId: number) {
    try {
      await runTaskCommand(`done ${taskId}`);
      showToast({
        style: Toast.Style.Success,
        title: "Task completed",
      });
      loadTasks();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to complete task",
      });
    }
  }

  async function startTask(taskId: number) {
    try {
      await runTaskCommand(`start ${taskId}`);
      showToast({
        style: Toast.Style.Success,
        title: "Task started",
      });
      loadTasks();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to start task",
      });
    }
  }

  async function stopTask(taskId: number) {
    try {
      await runTaskCommand(`stop ${taskId}`);
      showToast({
        style: Toast.Style.Success,
        title: "Task stopped",
      });
      loadTasks();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to stop task",
      });
    }
  }

  async function deleteTask(task: Task) {
    try {
      if (!task.uuid) {
        throw new Error("Task UUID is missing");
      }
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          task.uuid,
        )
      ) {
        throw new Error(`Invalid UUID format: ${task.uuid}`);
      }

      // Optimistically remove the task from local state first
      setTasks((prevTasks) => prevTasks.filter((t) => t.uuid !== task.uuid));

      await runTaskCommand(`rc.confirmation=off ${task.uuid} delete`);
      showToast({
        style: Toast.Style.Success,
        title: "Task deleted",
      });

      // Refresh from server to ensure consistency
      loadTasks();
    } catch (error: any) {
      // Revert the optimistic update on error
      loadTasks();

      // Check if the task is already deleted
      if (error.message && error.message.includes("is not deletable")) {
        showToast({
          style: Toast.Style.Failure,
          title: "Task already deleted",
          message: "This task has already been deleted",
        });
      } else {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to delete task",
          message: error.message || "Unknown error",
        });
      }
    }
  }

  async function modifyTask(taskId: number, newDescription: string) {
    try {
      await runTaskCommand(`${taskId} modify ${newDescription}`);
      showToast({
        style: Toast.Style.Success,
        title: "Task modified",
      });
      loadTasks();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to modify task",
      });
    }
  }

  async function syncTasks() {
    try {
      await runTaskCommand("sync");
      showToast({
        style: Toast.Style.Success,
        title: "Tasks synced",
      });
      loadTasks();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to sync tasks",
      });
    }
  }

  function getTaskSubtitle(task: Task): string {
    const parts: string[] = [];

    if (task.project) {
      parts.push(`📁 ${task.project}`);
    }

    if (task.tags && task.tags.length > 0) {
      parts.push(`🏷️ ${task.tags.join(", ")}`);
    }

    if (task.due) {
      parts.push(`📅 ${formatDate(task.due)}`);
    }

    if (task.scheduled) {
      parts.push(`⏰ ${formatDate(task.scheduled)}`);
    }

    if (task.annotations && task.annotations.length > 0) {
      parts.push(
        `📝 ${task.annotations.length} note${task.annotations.length > 1 ? "s" : ""}`,
      );
    }

    if (task.depends) {
      const depCount = task.depends
        .split(",")
        .filter((uuid) => uuid.trim()).length;
      if (depCount > 0) {
        parts.push(`🔗 ${depCount} dependenc${depCount > 1 ? "ies" : "y"}`);
      }
    }

    return parts.join("  ");
  }

  function getTaskDetails(task: Task): string {
    const details: string[] = [];

    details.push(`**ID:** ${task.id}`);
    details.push(``);
    details.push(`**UUID:** ${task.uuid}`);
    details.push(``);
    details.push(`**Status:** ${task.status}`);
    details.push(``);
    details.push(`**Urgency:** ${task.urgency.toFixed(2)}`);
    details.push(``);

    if (task.priority) {
      details.push(`**Priority:** ${task.priority}`);
      details.push(``);
    }

    if (task.project) {
      details.push(`**Project:** ${task.project}`);
      details.push(``);
    }

    if (task.tags && task.tags.length > 0) {
      details.push(`**Tags:** ${task.tags.join(", ")}`);
      details.push(``);
    }

    if (task.due) {
      const dueDate = parseTaskwarriorDate(task.due);
      details.push(
        `**Due:** ${dueDate ? formatDate(task.due) : "Invalid date"}`,
      );
      details.push(``);
    }

    if (task.scheduled) {
      const scheduledDate = parseTaskwarriorDate(task.scheduled);
      details.push(
        `**Scheduled:** ${scheduledDate ? formatDate(task.scheduled) : "Invalid date"}`,
      );
      details.push(``);
    }

    if (task.start) {
      const startDate = parseTaskwarriorDate(task.start);
      details.push(
        `**Started:** ${startDate ? formatDate(task.start) : "Invalid date"}`,
      );
      details.push(``);
    }

    if (task.end) {
      const endDate = parseTaskwarriorDate(task.end);
      details.push(
        `**Completed:** ${endDate ? formatDate(task.end) : "Invalid date"}`,
      );
      details.push(``);
    }

    const entryDate = parseTaskwarriorDate(task.entry);
    details.push(
      `**Created:** ${entryDate ? formatDate(task.entry) : "Invalid date"}`,
    );
    details.push(``);

    const modifiedDate = parseTaskwarriorDate(task.modified);
    details.push(
      `**Modified:** ${modifiedDate ? formatDate(task.modified) : "Invalid date"}`,
    );
    details.push(``);

    if (task.recur) {
      details.push(`**Recurs:** ${task.recur}`);
      details.push(``);
    }

    if (task.wait) {
      const waitDate = parseTaskwarriorDate(task.wait);
      details.push(
        `**Waiting until:** ${waitDate ? formatDate(task.wait) : "Invalid date"}`,
      );
      details.push(``);
    }

    if (task.until) {
      const untilDate = parseTaskwarriorDate(task.until);
      details.push(
        `**Until:** ${untilDate ? formatDate(task.until) : "Invalid date"}`,
      );
      details.push(``);
    }

    if (task.depends) {
      const depCount = task.depends
        .split(",")
        .filter((uuid) => uuid.trim()).length;
      details.push(
        `**Dependencies:** ${depCount} task${depCount > 1 ? "s" : ""}`,
      );
      details.push(``);
    }

    if (task.annotations && task.annotations.length > 0) {
      details.push(`## Annotations`);
      task.annotations.forEach((annotation, index) => {
        const annotationDate = parseTaskwarriorDate(annotation.entry);
        details.push(
          `${index + 1}. ${annotation.description}: ${annotationDate ? formatDate(annotation.entry) : "Invalid date"}`,
        );
        details.push(``);
      });
    }

    return details.join("\n");
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetails}
      searchBarPlaceholder="Search tasks..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="View"
          value={currentView}
          onChange={updateCurrentView}
        >
          <List.Dropdown.Section title="Views">
            <List.Dropdown.Item title="Next (urgent)" value="next" />
            <List.Dropdown.Item title="All pending" value="list" />
            <List.Dropdown.Item title="Overdue" value="overdue" />
            <List.Dropdown.Item title="Active" value="active" />
            <List.Dropdown.Item title="All tasks" value="all" />
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {tasks.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No tasks found"
          description={`No tasks in ${currentView} view`}
          icon={Icon.CheckCircle}
          actions={
            <ActionPanel>
              <Action
                title="Sync Tasks"
                icon={Icon.ArrowClockwise}
                onAction={syncTasks}
              />
              <Action
                title="Refresh"
                icon={Icon.RotateAntiClockwise}
                onAction={loadTasks}
              />
            </ActionPanel>
          }
        />
      ) : (
        <List.Section title={`${tasks.length} tasks`} subtitle={currentView}>
          {tasks.map((task) => (
            <List.Item
              key={task.uuid}
              title={task.description}
              subtitle={getTaskSubtitle(task)}
              icon={getPriorityIcon(task.priority)}
              detail={
                showDetails ? (
                  <List.Item.Detail markdown={getTaskDetails(task)} />
                ) : undefined
              }
              accessories={[
                {
                  text: task.urgency.toFixed(1),
                  tooltip: `Urgency: ${task.urgency.toFixed(2)}`,
                },
                ...(task.start ? [{ icon: Icon.Play, tooltip: "Active" }] : []),
                ...(task.recur
                  ? [{ icon: Icon.Repeat, tooltip: "Recurring" }]
                  : []),
              ]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    {task.status === "pending" && (
                      <Action
                        title="Complete Task"
                        icon={Icon.CheckCircle}
                        shortcut={{ modifiers: ["cmd"], key: "enter" }}
                        onAction={() => completeTask(task.id)}
                      />
                    )}
                    {task.status === "pending" && !task.start && (
                      <Action
                        title="Start Task"
                        icon={Icon.Play}
                        shortcut={{ modifiers: ["cmd"], key: "s" }}
                        onAction={() => startTask(task.id)}
                      />
                    )}
                    {task.status === "pending" && task.start && (
                      <Action
                        title="Stop Task"
                        icon={Icon.Pause}
                        shortcut={{ modifiers: ["cmd"], key: "s" }}
                        onAction={() => stopTask(task.id)}
                      />
                    )}
                    <Action
                      title="Delete Task"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: [], key: "delete" }}
                      onAction={() => deleteTask(task)}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action
                      title="Modify Task"
                      icon={Icon.Pencil}
                      onAction={() =>
                        push(
                          <ModifyTaskForm
                            task={task}
                            onTaskModified={loadTasks}
                          />,
                        )
                      }
                    />
                    <Action
                      title="Add Annotation"
                      icon={Icon.Plus}
                      onAction={() =>
                        push(
                          <AddAnnotationForm
                            task={task}
                            onAnnotationAdded={loadTasks}
                          />,
                        )
                      }
                    />
                    <Action
                      title="Sync Tasks"
                      icon={Icon.ArrowClockwise}
                      onAction={syncTasks}
                    />
                    <Action
                      title="Refresh"
                      icon={Icon.RotateAntiClockwise}
                      onAction={loadTasks}
                    />
                    <Action
                      title={showDetails ? "Hide Details" : "Show Details"}
                      icon={showDetails ? Icon.EyeDisabled : Icon.Eye}
                      shortcut={{ modifiers: ["cmd"], key: "d" }}
                      onAction={() => updateShowDetails(!showDetails)}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
