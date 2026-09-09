import { getValidToken } from "./google-auth";

const BASE = "https://tasks.googleapis.com/tasks/v1";

export interface GoogleTask {
  id: string;
  title?: string;
  notes?: string;
  status: "needsAction" | "completed";
  /** RFC3339; Google only stores the date part */
  due?: string;
  completed?: string;
  updated: string;
  parent?: string;
  deleted?: boolean;
  hidden?: boolean;
}

/** PATCH bodies may carry `completed: null` to clear the completion time. */
export type RemoteFields = Omit<Partial<GoogleTask>, "completed"> & {
  completed?: string | null;
};

interface GoogleTaskList {
  id: string;
  title: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getValidToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Tasks API ${method} ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Find the task list with the given title, creating it if missing. */
export async function ensureTaskList(title: string): Promise<string> {
  const { items = [] } = await request<{ items?: GoogleTaskList[] }>(
    "GET",
    "/users/@me/lists?maxResults=100",
  );
  const existing = items.find((l) => l.title === title);
  if (existing) return existing.id;
  const created = await request<GoogleTaskList>("POST", "/users/@me/lists", { title });
  return created.id;
}

/** List every task in the list, including completed, hidden and deleted ones. */
export async function listTasks(listId: string): Promise<GoogleTask[]> {
  const tasks: GoogleTask[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      maxResults: "100",
      showCompleted: "true",
      showHidden: "true",
      showDeleted: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await request<{ items?: GoogleTask[]; nextPageToken?: string }>(
      "GET",
      `/lists/${listId}/tasks?${params}`,
    );
    tasks.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return tasks;
}

export async function insertTask(
  listId: string,
  task: RemoteFields,
): Promise<GoogleTask> {
  const { completed, ...rest } = task;
  return request<GoogleTask>("POST", `/lists/${listId}/tasks`, {
    ...rest,
    ...(typeof completed === "string" ? { completed } : {}),
  });
}

export async function patchTask(
  listId: string,
  taskId: string,
  patch: RemoteFields,
): Promise<GoogleTask> {
  return request<GoogleTask>("PATCH", `/lists/${listId}/tasks/${taskId}`, patch);
}

export async function deleteTask(listId: string, taskId: string): Promise<void> {
  await request<void>("DELETE", `/lists/${listId}/tasks/${taskId}`);
}

/** Re-parent a task (used to mirror local subtasks). */
export async function moveTask(
  listId: string,
  taskId: string,
  parentId?: string,
): Promise<void> {
  const params = parentId ? `?parent=${encodeURIComponent(parentId)}` : "";
  await request<void>("POST", `/lists/${listId}/tasks/${taskId}/move${params}`);
}
