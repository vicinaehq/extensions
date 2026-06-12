import { LocalStorage } from "@vicinae/api";
import { getGoogleConfig } from "./google-auth";
import * as gtasks from "./gtasks";
import { GoogleTask } from "./gtasks";
import { Task, getAllTasks, saveTasks } from "./store";

const LIST_CACHE_KEY = "google-list-cache";
const LAST_SYNC_KEY = "last-sync-at";

export interface SyncResult {
  pushed: number;
  pulled: number;
  deleted: number;
}

function remoteDueToLocal(due?: string): string | undefined {
  return due?.slice(0, 10);
}

type RemoteFields = Omit<Partial<GoogleTask>, "completed"> & { completed?: string | null };

function localFieldsToRemote(task: Task): RemoteFields {
  return {
    title: task.title,
    notes: task.notes ?? "",
    due: task.due ? `${task.due}T00:00:00.000Z` : undefined,
    status: task.completed ? "completed" : "needsAction",
    ...(task.completed ? {} : { completed: null }),
  };
}

function sameContent(local: Task, remote: GoogleTask): boolean {
  return (
    local.title === (remote.title ?? "") &&
    (local.notes ?? "") === (remote.notes ?? "") &&
    (local.due ?? "") === (remoteDueToLocal(remote.due) ?? "") &&
    local.completed === (remote.status === "completed")
  );
}

function applyRemoteToLocal(local: Task, remote: GoogleTask, googleIdToLocalId: Map<string, string>) {
  local.title = remote.title ?? "";
  local.notes = remote.notes || undefined;
  local.due = remoteDueToLocal(remote.due);
  local.completed = remote.status === "completed";
  local.completedAt = remote.completed;
  local.parentId = remote.parent ? googleIdToLocalId.get(remote.parent) : undefined;
  local.updatedAt = remote.updated;
}

async function getListId(listName: string): Promise<string> {
  const raw = await LocalStorage.getItem<string>(LIST_CACHE_KEY);
  if (raw) {
    try {
      const cache = JSON.parse(raw) as { name: string; id: string };
      if (cache.name === listName) return cache.id;
    } catch {
      // fall through and re-resolve
    }
  }
  const id = await gtasks.ensureTaskList(listName);
  await LocalStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ name: listName, id }));
  return id;
}

export async function getLastSyncAt(): Promise<number> {
  const raw = await LocalStorage.getItem<string>(LAST_SYNC_KEY);
  return raw ? Number(raw) : 0;
}

/**
 * Two-way sync with last-write-wins conflict resolution, keyed on the
 * local `updatedAt` vs Google's `updated` timestamps.
 */
export async function syncWithGoogle(): Promise<SyncResult> {
  const { listName } = await getGoogleConfig();
  const listId = await getListId(listName);

  const local = await getAllTasks();
  const remote = await gtasks.listTasks(listId);
  const remoteById = new Map(remote.map((t) => [t.id, t]));
  const result: SyncResult = { pushed: 0, pulled: 0, deleted: 0 };
  const purgedIds = new Set<string>();

  // Parents before children so a subtask can reference its parent's googleId.
  const ordered = [...local].sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));

  for (const task of ordered) {
    if (task.deleted) {
      const r = task.googleId ? remoteById.get(task.googleId) : undefined;
      if (task.googleId && r && !r.deleted) {
        await gtasks.deleteTask(listId, task.googleId);
        result.deleted++;
      }
      purgedIds.add(task.id);
      continue;
    }

    if (!task.googleId) {
      const created = await gtasks.insertTask(listId, localFieldsToRemote(task));
      task.googleId = created.id;
      const parentGoogleId = task.parentId
        ? local.find((t) => t.id === task.parentId)?.googleId
        : undefined;
      if (parentGoogleId) await gtasks.moveTask(listId, created.id, parentGoogleId);
      result.pushed++;
      continue;
    }

    const r = remoteById.get(task.googleId);
    if (!r || r.deleted) {
      // Deleted on Google — remote deletion wins.
      purgedIds.add(task.id);
      for (const child of local.filter((t) => t.parentId === task.id)) purgedIds.add(child.id);
      result.deleted++;
      continue;
    }
    if (sameContent(task, r)) continue;

    if (Date.parse(task.updatedAt) > Date.parse(r.updated)) {
      await gtasks.patchTask(listId, task.googleId, localFieldsToRemote(task));
      result.pushed++;
    } else {
      const googleIdToLocalId = new Map(
        local.filter((t) => t.googleId).map((t) => [t.googleId as string, t.id]),
      );
      applyRemoteToLocal(task, r, googleIdToLocalId);
      result.pulled++;
    }
  }

  // Tasks created on Google that we don't know yet — parents first.
  const knownGoogleIds = new Set(local.map((t) => t.googleId).filter(Boolean));
  const newRemote = remote
    .filter((r) => !r.deleted && !knownGoogleIds.has(r.id))
    .sort((a, b) => Number(Boolean(a.parent)) - Number(Boolean(b.parent)));
  for (const r of newRemote) {
    const googleIdToLocalId = new Map(
      local.filter((t) => t.googleId).map((t) => [t.googleId as string, t.id]),
    );
    const task: Task = {
      id: crypto.randomUUID(),
      title: r.title ?? "",
      notes: r.notes || undefined,
      due: remoteDueToLocal(r.due),
      parentId: r.parent ? googleIdToLocalId.get(r.parent) : undefined,
      completed: r.status === "completed",
      completedAt: r.completed,
      createdAt: r.updated,
      updatedAt: r.updated,
      googleId: r.id,
    };
    local.push(task);
    result.pulled++;
  }

  await saveTasks(local.filter((t) => !purgedIds.has(t.id)));
  await LocalStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  return result;
}
