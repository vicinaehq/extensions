import { showToast, Toast } from "@vicinae/api";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import { App, ExportedSettings, RecentProject, SettingsBackup, UsageStore } from "@/types";
import { DEFAULT_RECENT_PROJECTS_COUNT } from "@/utils/constants";
import {
  clampScanDepth,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_SCAN_DEPTH,
  normalizeIgnorePatterns,
} from "@/utils/discovery";
import { normalizeProjectTags, normalizeTags } from "@/utils/tags";
import { normalizeUsageStore } from "@/utils/usage";
import { normalizeApp } from "@/utils/validation";

export const DEFAULT_SETTINGS: ExportedSettings = {
  defaultApp: null,
  ignorePatterns: DEFAULT_IGNORE_PATTERNS,
  includeNested: false,
  onboardingCompleted: false,
  pinnedProjects: [],
  projectTags: {},
  recentProjects: [],
  recentProjectsCount: DEFAULT_RECENT_PROJECTS_COUNT,
  requireMarkers: false,
  scanDepth: DEFAULT_SCAN_DEPTH,
  showGitStatus: true,
  showRecentProjects: false,
  showStashCount: false,
  tags: [],
  terminalApp: null,
  workspaceApps: {},
  workspaces: [],
};

export async function exportSettingsToDownloads(settings: ExportedSettings): Promise<void> {
  try {
    const backup: SettingsBackup = {
      exportedAt: new Date().toISOString(),
      settings,
      version: 4,
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `workspace-settings-${timestamp}.json`;
    const outputPath = await resolveExportPath(filename);

    await writeFile(outputPath, JSON.stringify(backup, null, 2), "utf-8");
    await showToast({
      message: outputPath,
      style: Toast.Style.Success,
      title: "Settings exported",
    });
  } catch {
    await showToast({ style: Toast.Style.Failure, title: "Failed to export settings" });
  }
}

export async function importSettingsFromFile(
  filePath: string,
  fallback: ExportedSettings,
): Promise<ExportedSettings | null> {
  try {
    const fileContents = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(fileContents) as unknown;

    if (!isRecognizableBackup(parsed)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Not a Workspace backup",
      });
      return null;
    }

    return normalizeImportedSettings(parsed, fallback);
  } catch {
    await showToast({ style: Toast.Style.Failure, title: "Failed to import settings file" });
    return null;
  }
}

export function normalizeImportedSettings(payload: unknown, fallback: ExportedSettings): ExportedSettings {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const parsedSettings =
    "settings" in payload && payload.settings && typeof payload.settings === "object"
      ? (payload.settings as Partial<ExportedSettings>)
      : (payload as Partial<ExportedSettings>);

  const tags = normalizeTags(parsedSettings.tags ?? fallback.tags);

  return {
    defaultApp: normalizeApp(parsedSettings.defaultApp),
    ignorePatterns: normalizeIgnorePatterns(parsedSettings.ignorePatterns, fallback.ignorePatterns),
    includeNested:
      typeof parsedSettings.includeNested === "boolean" ? parsedSettings.includeNested : fallback.includeNested,
    onboardingCompleted:
      typeof parsedSettings.onboardingCompleted === "boolean"
        ? parsedSettings.onboardingCompleted
        : fallback.onboardingCompleted,
    pinnedProjects: Array.isArray(parsedSettings.pinnedProjects)
      ? parsedSettings.pinnedProjects.filter((value): value is string => typeof value === "string")
      : fallback.pinnedProjects,
    projectTags: normalizeProjectTags(parsedSettings.projectTags ?? fallback.projectTags, tags),
    recentProjects: Array.isArray(parsedSettings.recentProjects)
      ? parsedSettings.recentProjects.filter(
          (value): value is RecentProject =>
            typeof value === "object" &&
            value !== null &&
            typeof (value as RecentProject).path === "string" &&
            typeof (value as RecentProject).lastOpened === "number",
        )
      : fallback.recentProjects,
    recentProjectsCount:
      typeof parsedSettings.recentProjectsCount === "number" && parsedSettings.recentProjectsCount > 0
        ? parsedSettings.recentProjectsCount
        : fallback.recentProjectsCount,
    requireMarkers:
      typeof parsedSettings.requireMarkers === "boolean" ? parsedSettings.requireMarkers : fallback.requireMarkers,
    scanDepth:
      typeof parsedSettings.scanDepth === "number" ? clampScanDepth(parsedSettings.scanDepth) : fallback.scanDepth,
    showGitStatus:
      typeof parsedSettings.showGitStatus === "boolean" ? parsedSettings.showGitStatus : fallback.showGitStatus,
    showRecentProjects:
      typeof parsedSettings.showRecentProjects === "boolean"
        ? parsedSettings.showRecentProjects
        : fallback.showRecentProjects,
    showStashCount:
      typeof parsedSettings.showStashCount === "boolean" ? parsedSettings.showStashCount : fallback.showStashCount,
    tags,
    terminalApp: normalizeApp(parsedSettings.terminalApp),
    usage: normalizeImportedUsage(parsedSettings.usage, fallback.usage),
    workspaceApps:
      parsedSettings.workspaceApps && typeof parsedSettings.workspaceApps === "object"
        ? Object.fromEntries(
            Object.entries(parsedSettings.workspaceApps).flatMap(([key, value]) => {
              const app = normalizeApp(value);
              return app ? [[key, app] as [string, App]] : [];
            }),
          )
        : fallback.workspaceApps,
    workspaces: Array.isArray(parsedSettings.workspaces)
      ? parsedSettings.workspaces.filter((value): value is string => typeof value === "string")
      : fallback.workspaces,
  };
}

function normalizeImportedUsage(
  value: UsageStore | undefined,
  fallback: UsageStore | undefined,
): UsageStore | undefined {
  if (value) {
    return normalizeUsageStore(value);
  }
  return fallback ? normalizeUsageStore(fallback) : undefined;
}

function isRecognizableBackup(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  if (
    (record.version === 1 || record.version === 2 || record.version === 3 || record.version === 4) &&
    record.settings &&
    typeof record.settings === "object"
  ) {
    return true;
  }

  return Array.isArray(record.workspaces);
}

async function resolveExportPath(filename: string): Promise<string> {
  const downloads = path.join(os.homedir(), "Downloads");

  try {
    await mkdir(downloads, { recursive: true });
    return path.join(downloads, filename);
  } catch {
    return path.join(os.homedir(), filename);
  }
}
