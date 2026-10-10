import { Icon, Image, type ImageLike } from "@vicinae/api";
import path from "path";
import { pathToFileURL } from "url";

import { Project, Tag } from "@/types";

const MARKER_KEYWORDS: Record<string, string[]> = {
  ".git": ["git"],
  "package.json": ["node", "javascript", "typescript", "npm"],
  "Cargo.toml": ["rust", "cargo"],
  "go.mod": ["go", "golang"],
  "pyproject.toml": ["python"],
  "composer.json": ["php", "composer"],
  Gemfile: ["ruby", "rails"],
  "mix.exs": ["elixir"],
  "pom.xml": ["java", "maven"],
  "build.gradle": ["java", "gradle", "android"],
  "build.gradle.kts": ["java", "gradle", "kotlin"],
};

/** Marker-based fallback when no `.workspace/icon.*` is present. */
export function markerIcon(markers?: string[]): Icon {
  if (!markers?.length) {
    return Icon.Folder;
  }

  if (markers.includes("package.json")) return Icon.Code;
  if (markers.includes("Cargo.toml")) return Icon.Hammer;
  if (markers.includes("go.mod")) return Icon.CodeBlock;
  if (markers.includes("pyproject.toml")) return Icon.BlankDocument;
  if (markers.includes("composer.json") || markers.includes("Gemfile") || markers.includes("mix.exs")) {
    return Icon.Code;
  }
  if (markers.includes("pom.xml") || markers.includes("build.gradle") || markers.includes("build.gradle.kts")) {
    return Icon.Box;
  }
  if (markers.includes(".git")) return Icon.Folder;

  return Icon.Folder;
}

export function projectListIcon(project: Pick<Project, "iconPath" | "markers">): ImageLike {
  const fallback = markerIcon(project.markers);
  if (!project.iconPath) {
    return fallback;
  }

  return {
    fallback,
    mask: Image.Mask.RoundedRectangle,
    source: pathToFileURL(project.iconPath).href,
  };
}

export function projectKeywords(project: Project, showGitStatus: boolean, tags: Tag[] = []): string[] {
  const keywords = new Set<string>();
  keywords.add(project.fullPath);
  keywords.add(project.parentFolder);
  const workspaceName = path.basename(project.parentFolder);
  keywords.add(workspaceName);
  keywords.add(path.dirname(project.fullPath));
  keywords.add(`@${workspaceName}`);

  for (const marker of project.markers ?? []) {
    keywords.add(marker);
    for (const alias of MARKER_KEYWORDS[marker] ?? []) {
      keywords.add(alias);
    }
  }

  for (const tag of tags) {
    keywords.add(tag.name);
    keywords.add(`tag:${tag.name}`);
  }

  if (showGitStatus && project.gitStatus?.branch) {
    keywords.add(project.gitStatus.branch);
  }

  if (project.gitStatus) {
    if (project.gitStatus.dirty > 0) keywords.add("dirty");
    if (project.gitStatus.dirty === 0) keywords.add("clean");
    if (project.gitStatus.untracked > 0) keywords.add("untracked");
  }

  return [...keywords];
}

export function formatGitUpdatedAt(updatedAt?: number): string | undefined {
  if (!updatedAt) return undefined;
  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type ProjectFilter = "all" | "dirty" | "clean" | "pinned" | `ws:${string}` | `tag:${string}`;

export function matchesProjectFilter(
  project: Project,
  filter: ProjectFilter,
  pinnedPaths: Set<string>,
  projectTags: Record<string, string[]> = {},
): boolean {
  if (filter === "all") return true;
  if (filter === "pinned") return pinnedPaths.has(project.fullPath);
  if (filter === "dirty") return (project.gitStatus?.dirty ?? 0) > 0;
  if (filter === "clean") {
    if (!project.isGitRepo && project.gitStatus == null) return false;
    return (project.gitStatus?.dirty ?? 0) === 0;
  }
  if (filter.startsWith("ws:")) {
    return project.parentFolder === filter.slice(3);
  }
  if (filter.startsWith("tag:")) {
    const tagId = filter.slice(4);
    return (projectTags[project.fullPath] ?? []).includes(tagId);
  }
  return true;
}
