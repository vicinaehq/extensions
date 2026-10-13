import { Color } from "@vicinae/api";

import { Tag } from "@/types";

export const TAG_COLORS: { color: Color; label: string }[] = [
  { color: Color.Blue, label: "Blue" },
  { color: Color.Green, label: "Green" },
  { color: Color.Magenta, label: "Magenta" },
  { color: Color.Orange, label: "Orange" },
  { color: Color.Purple, label: "Purple" },
  { color: Color.Red, label: "Red" },
  { color: Color.Yellow, label: "Yellow" },
];

export function createTagId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return slug ? `${slug}-${suffix}` : suffix;
}

export function normalizeTags(value: unknown): Tag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const tags: Tag[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Partial<Tag>;
    if (typeof record.id !== "string" || !record.id.trim()) continue;
    if (typeof record.name !== "string" || !record.name.trim()) continue;
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    tags.push({
      color: isTagColor(record.color) ? record.color : Color.Blue,
      id: record.id,
      name: record.name.trim(),
    });
  }

  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeProjectTags(value: unknown, tags: Tag[]): Record<string, string[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const validIds = new Set(tags.map((tag) => tag.id));
  const result: Record<string, string[]> = {};

  for (const [projectPath, ids] of Object.entries(value as Record<string, unknown>)) {
    if (typeof projectPath !== "string" || !projectPath) continue;
    if (!Array.isArray(ids)) continue;
    const cleaned = [...new Set(ids.filter((id): id is string => typeof id === "string" && validIds.has(id)))];
    if (cleaned.length > 0) {
      result[projectPath] = cleaned;
    }
  }

  return result;
}

export function tagsForProject(projectPath: string, tags: Tag[], projectTags: Record<string, string[]>): Tag[] {
  const ids = projectTags[projectPath] ?? [];
  if (ids.length === 0) return [];
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return ids.map((id) => byId.get(id)).filter((tag): tag is Tag => tag != null);
}

export function addTagToProject(
  projectTags: Record<string, string[]>,
  projectPath: string,
  tagId: string,
): Record<string, string[]> {
  const current = projectTags[projectPath] ?? [];
  if (current.includes(tagId)) {
    return projectTags;
  }
  return { ...projectTags, [projectPath]: [...current, tagId] };
}

export function removeTagFromProject(
  projectTags: Record<string, string[]>,
  projectPath: string,
  tagId: string,
): Record<string, string[]> {
  const current = projectTags[projectPath] ?? [];
  const next = current.filter((id) => id !== tagId);
  const copy = { ...projectTags };
  if (next.length === 0) {
    delete copy[projectPath];
  } else {
    copy[projectPath] = next;
  }
  return copy;
}

/** Replace every assignment of `tagId` with exactly `projectPaths`. */
export function syncTagProjects(
  projectTags: Record<string, string[]>,
  tagId: string,
  projectPaths: string[],
): Record<string, string[]> {
  let next = { ...projectTags };

  for (const path of Object.keys(next)) {
    next = removeTagFromProject(next, path, tagId);
  }

  for (const path of projectPaths) {
    next = addTagToProject(next, path, tagId);
  }

  return next;
}

export function projectsWithTag(projectTags: Record<string, string[]>, tagId: string): string[] {
  return Object.entries(projectTags)
    .filter(([, ids]) => ids.includes(tagId))
    .map(([path]) => path)
    .sort();
}

export function deleteTagFromCatalog(
  tags: Tag[],
  projectTags: Record<string, string[]>,
  tagId: string,
): { projectTags: Record<string, string[]>; tags: Tag[] } {
  const nextTags = tags.filter((tag) => tag.id !== tagId);
  const nextProjectTags: Record<string, string[]> = {};
  for (const [projectPath, ids] of Object.entries(projectTags)) {
    const cleaned = ids.filter((id) => id !== tagId);
    if (cleaned.length > 0) {
      nextProjectTags[projectPath] = cleaned;
    }
  }
  return { projectTags: nextProjectTags, tags: nextTags };
}

function isTagColor(value: unknown): value is Color {
  return (
    value === Color.Blue ||
    value === Color.Green ||
    value === Color.Magenta ||
    value === Color.Orange ||
    value === Color.Purple ||
    value === Color.Red ||
    value === Color.Yellow
  );
}
