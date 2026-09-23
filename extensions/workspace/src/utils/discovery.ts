import { access, readdir } from "fs/promises";
import path from "path";

import { Project } from "@/types";

export const DEFAULT_SCAN_DEPTH = 1;
export const MAX_SCAN_DEPTH = 5;
export const MAX_DIRS_VISITED = 5000;

export const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  "Pods",
  ".next",
  ".turbo",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "out",
  "tmp",
  "temp",
];

export const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "composer.json",
  "Gemfile",
  "mix.exs",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
] as const;

/** Looked up under `<project>/.workspace/` — first match wins. */
export const PROJECT_ICON_FILES = [
  "icon.png",
  "icon.jpg",
  "icon.jpeg",
  "icon.webp",
  "icon.svg",
  "icon.ico",
] as const;

export type ScanOptions = {
  ignorePatterns: string[];
  includeNested: boolean;
  requireMarkers: boolean;
  scanDepth: number;
};

export function clampScanDepth(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_SCAN_DEPTH;
  }
  return Math.min(Math.floor(value), MAX_SCAN_DEPTH);
}

export function normalizeIgnorePatterns(patterns: unknown, fallback: string[]): string[] {
  if (!Array.isArray(patterns)) {
    return fallback;
  }

  const cleaned = patterns
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return cleaned.length > 0 ? [...new Set(cleaned)] : fallback;
}

export type WorkspaceScanResult = {
  projects: Project[];
  truncated: boolean;
};

export async function scanWorkspaceProjects(
  workspacePath: string,
  options: ScanOptions,
): Promise<WorkspaceScanResult> {
  const projects: Project[] = [];
  let visited = 0;
  let truncated = false;
  const depth = clampScanDepth(options.scanDepth);
  const ignore = normalizeIgnorePatterns(options.ignorePatterns, DEFAULT_IGNORE_PATTERNS);

  async function walk(dir: string, currentDepth: number): Promise<void> {
    if (truncated || currentDepth >= depth) {
      return;
    }

    if (visited >= MAX_DIRS_VISITED) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const directories = entries
      .filter((entry) => entry.isDirectory() && !shouldSkipDirectory(entry.name, ignore))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of directories) {
      if (visited >= MAX_DIRS_VISITED) {
        truncated = true;
        return;
      }

      visited += 1;
      const fullPath = path.join(dir, entry.name);
      const childDepth = currentDepth + 1;
      const markers = await detectProjectMarkers(fullPath);
      const treatAsProject =
        markers.length > 0 || (childDepth === 1 && depth === 1 && !options.requireMarkers);

      if (treatAsProject) {
        const iconPath = await detectProjectIcon(fullPath);
        projects.push({
          fullPath,
          iconPath,
          markers: markers.length > 0 ? markers : undefined,
          name: entry.name,
          parentFolder: workspacePath,
        });

        if (!options.includeNested) {
          continue;
        }
      }

      if (childDepth < depth) {
        await walk(fullPath, childDepth);
      }
    }
  }

  await walk(workspacePath, 0);
  return {
    projects: projects.sort((a, b) => a.name.localeCompare(b.name) || a.fullPath.localeCompare(b.fullPath)),
    truncated,
  };
}

export async function detectProjectMarkers(dirPath: string): Promise<string[]> {
  const found: string[] = [];

  for (const marker of PROJECT_MARKERS) {
    if (await pathExists(path.join(dirPath, marker))) {
      found.push(marker);
    }
  }

  return found;
}

export async function detectProjectIcon(dirPath: string): Promise<string | undefined> {
  const folder = path.join(dirPath, ".workspace");
  for (const file of PROJECT_ICON_FILES) {
    const candidate = path.join(folder, file);
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function shouldSkipDirectory(name: string, ignorePatterns: string[]): boolean {
  if (name.startsWith(".")) {
    return true;
  }

  return ignorePatterns.some((pattern) => matchesIgnorePattern(name, pattern));
}

function matchesIgnorePattern(name: string, pattern: string): boolean {
  const normalized = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized.includes("*") && !normalized.includes("/")) {
    return name === normalized;
  }

  if (normalized.includes("/")) {
    return false;
  }

  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(name);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
