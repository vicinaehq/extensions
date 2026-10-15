import { LocalStorage } from "@vicinae/api";
import type { Backend } from "../types";

const BACKENDS_KEY = "clash.backends.v1";
const CURRENT_KEY = "clash.current-backend.v1";

type StoredBackend = Omit<Backend, "name"> & { name?: string };

function defaultBackendName(urlValue: string): string {
  try {
    const url = new URL(urlValue);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return urlValue;
  }
}

function parseBackends(value: string | undefined): Backend[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is StoredBackend =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Backend).id === "string" &&
          typeof (item as Backend).url === "string" &&
          typeof (item as Backend).secret === "string",
      )
      .map((item) => ({
        ...item,
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : defaultBackendName(item.url),
      }));
  } catch {
    return [];
  }
}

export function normalizeBackendUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Backend URL must use HTTP or HTTPS.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function getBackends(): Promise<Backend[]> {
  return parseBackends(await LocalStorage.getItem<string>(BACKENDS_KEY));
}

export async function getCurrentBackend(): Promise<Backend | undefined> {
  const [backends, currentId] = await Promise.all([getBackends(), LocalStorage.getItem<string>(CURRENT_KEY)]);
  return backends.find(({ id }) => id === currentId) ?? backends[0];
}

function normalizeSecret(value: string): string {
  return value
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
}

export async function saveBackend(
  nameValue: string,
  urlValue: string,
  secretValue: string,
  backendId?: string,
): Promise<Backend> {
  const name = nameValue.trim();
  if (!name) throw new Error("Backend name is required.");
  const url = normalizeBackendUrl(urlValue);
  const secret = normalizeSecret(secretValue);
  const backends = await getBackends();
  const existing = backendId
    ? backends.find((backend) => backend.id === backendId)
    : backends.find((backend) => backend.url === url);
  if (backendId && !existing) throw new Error("Backend no longer exists.");
  if (backends.some((backend) => backend.url === url && backend.id !== existing?.id)) {
    throw new Error("A backend with this URL already exists.");
  }
  const backend: Backend = existing
    ? { ...existing, name, url, secret }
    : { id: crypto.randomUUID(), name, url, secret };
  const next = existing ? backends.map((item) => (item.id === existing.id ? backend : item)) : [...backends, backend];
  await LocalStorage.setItem(BACKENDS_KEY, JSON.stringify(next));
  if (!backendId && !(await LocalStorage.getItem<string>(CURRENT_KEY))) {
    await LocalStorage.setItem(CURRENT_KEY, backend.id);
  }
  return backend;
}

export async function setCurrentBackend(id: string): Promise<void> {
  await LocalStorage.setItem(CURRENT_KEY, id);
}

export async function removeBackend(id: string): Promise<void> {
  const backends = await getBackends();
  const next = backends.filter((backend) => backend.id !== id);
  const currentId = await LocalStorage.getItem<string>(CURRENT_KEY);
  await LocalStorage.setItem(BACKENDS_KEY, JSON.stringify(next));
  if (currentId === id) {
    if (next[0]) await LocalStorage.setItem(CURRENT_KEY, next[0].id);
    else await LocalStorage.removeItem(CURRENT_KEY);
  }
}

export async function clearBackends(): Promise<void> {
  await Promise.all([LocalStorage.removeItem(BACKENDS_KEY), LocalStorage.removeItem(CURRENT_KEY)]);
}
