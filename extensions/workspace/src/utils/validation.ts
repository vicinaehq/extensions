import { type Application } from "@vicinae/api";

import { App } from "@/types";

export function toApp(app: Application): App {
  return {
    id: app.id,
    name: app.name,
    path: app.path,
  };
}

export function normalizeApp(value: unknown): App | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string") {
    return null;
  }

  const id = typeof record.id === "string" ? record.id : "";

  if (!id) {
    return null;
  }

  return {
    id,
    name: record.name,
    path: typeof record.path === "string" ? record.path : undefined,
  };
}
