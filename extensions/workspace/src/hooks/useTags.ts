import { Color } from "@vicinae/api";
import { useCallback } from "react";

import { peekCachedState, useCachedState } from "@/hooks/useCachedState";
import { Tag } from "@/types";
import { STORAGE_KEY_PROJECT_TAGS, STORAGE_KEY_TAGS } from "@/utils/constants";
import {
  addTagToProject,
  createTagId,
  deleteTagFromCatalog,
  normalizeProjectTags,
  normalizeTags,
  removeTagFromProject,
  syncTagProjects,
  tagsForProject,
} from "@/utils/tags";

export function useTags() {
  const [rawTags, setTags, tagsHydrated] = useCachedState<Tag[]>(STORAGE_KEY_TAGS, []);
  const [rawProjectTags, setProjectTags, projectTagsHydrated] = useCachedState<Record<string, string[]>>(
    STORAGE_KEY_PROJECT_TAGS,
    {},
  );

  const tags = normalizeTags(rawTags);
  const projectTags = normalizeProjectTags(rawProjectTags, tags);

  const readTags = () => normalizeTags(peekCachedState<Tag[]>(STORAGE_KEY_TAGS, []));
  const readProjectTags = (catalog: Tag[]) =>
    normalizeProjectTags(peekCachedState<Record<string, string[]>>(STORAGE_KEY_PROJECT_TAGS, {}), catalog);

  const replaceTags = useCallback(async (nextTags: Tag[], nextProjectTags?: Record<string, string[]>) => {
    const normalized = normalizeTags(nextTags);
    setTags(normalized);
    setProjectTags(normalizeProjectTags(nextProjectTags ?? readProjectTags(normalized), normalized));
  }, [setProjectTags, setTags]);

  const createTag = useCallback(
    async (name: string, color: Color = Color.Blue): Promise<Tag | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const current = readTags();
      const existing = current.find((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing;

      const tag: Tag = { color, id: createTagId(trimmed), name: trimmed };
      setTags(normalizeTags([...current, tag]));
      return tag;
    },
    [setTags],
  );

  const updateTag = useCallback(
    async (tagId: string, patch: Partial<Pick<Tag, "color" | "name">>) => {
      const current = readTags();
      setTags(
        normalizeTags(
          current.map((tag) =>
            tag.id === tagId
              ? {
                  ...tag,
                  color: patch.color ?? tag.color,
                  name: patch.name?.trim() || tag.name,
                }
              : tag,
          ),
        ),
      );
    },
    [setTags],
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      const currentTags = readTags();
      const currentProjectTags = readProjectTags(currentTags);
      const next = deleteTagFromCatalog(currentTags, currentProjectTags, tagId);
      setTags(next.tags);
      setProjectTags(next.projectTags);
    },
    [setProjectTags, setTags],
  );

  const assignTag = useCallback(
    async (projectPath: string, tagId: string) => {
      const currentTags = readTags();
      const currentProjectTags = readProjectTags(currentTags);
      setProjectTags(addTagToProject(currentProjectTags, projectPath, tagId));
    },
    [setProjectTags],
  );

  const unassignTag = useCallback(
    async (projectPath: string, tagId: string) => {
      const currentTags = readTags();
      const currentProjectTags = readProjectTags(currentTags);
      setProjectTags(removeTagFromProject(currentProjectTags, projectPath, tagId));
    },
    [setProjectTags],
  );

  const syncTagProjectsBulk = useCallback(
    async (tagId: string, projectPaths: string[]) => {
      const currentTags = readTags();
      const currentProjectTags = readProjectTags(currentTags);
      setProjectTags(syncTagProjects(currentProjectTags, tagId, projectPaths));
    },
    [setProjectTags],
  );

  const getProjectTags = useCallback(
    (projectPath: string) => tagsForProject(projectPath, tags, projectTags),
    [projectTags, tags],
  );

  return {
    assignTag,
    createTag,
    deleteTag,
    getProjectTags,
    isHydrated: tagsHydrated && projectTagsHydrated,
    projectTags,
    replaceTags,
    syncTagProjects: syncTagProjectsBulk,
    tags,
    unassignTag,
    updateTag,
  };
}
