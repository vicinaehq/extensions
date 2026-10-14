import { LocalStorage } from "@vicinae/api";
import { randomUUID } from "node:crypto";

export interface Task {
  id: string;
  title: string;
  notes?: string;
  /** ISO date, date-only (YYYY-MM-DD) — matches what Google Tasks can store */
  due?: string;
  /** HH:MM, 24h — local-only; Google Tasks cannot store a time of day */
  dueTime?: string;
  parentId?: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** tombstone kept around for sync; filtered out of the UI */
  deleted?: boolean;
  googleId?: string;
}

const STORAGE_KEY = "tasks";

export async function getAllTasks(): Promise<Task[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Task[];
  } catch {
    return [];
  }
}

export async function getTasks(): Promise<Task[]> {
  return (await getAllTasks()).filter((t) => !t.deleted);
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export async function addTask(
  fields: Pick<Task, "title"> & Partial<Pick<Task, "notes" | "due" | "dueTime" | "parentId">>,
): Promise<Task> {
  const now = new Date().toISOString();
  const task: Task = {
    id: randomUUID(),
    completed: false,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
  const tasks = await getAllTasks();
  tasks.push(task);
  await saveTasks(tasks);
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, "id" | "createdAt">>,
): Promise<Task | undefined> {
  const tasks = await getAllTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return undefined;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  await saveTasks(tasks);
  return task;
}

export async function toggleCompleted(id: string): Promise<Task | undefined> {
  const tasks = await getAllTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return undefined;
  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : undefined;
  task.updatedAt = new Date().toISOString();
  await saveTasks(tasks);
  return task;
}

/** Soft-delete a task and its subtasks (tombstones kept for sync). */
export async function deleteTask(id: string): Promise<void> {
  const tasks = await getAllTasks();
  const now = new Date().toISOString();
  for (const t of tasks) {
    if (t.id === id || t.parentId === id) {
      t.deleted = true;
      t.updatedAt = now;
    }
  }
  await saveTasks(tasks);
}

/** Format a Date as a local YYYY-MM-DD string. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIsoDate(): string {
  return toIsoDate(new Date());
}
