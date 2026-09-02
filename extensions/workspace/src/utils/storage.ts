import { showToast, Toast } from "@vicinae/api";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import { App, ExportedSettings, RecentProject, SettingsBackup } from "@/types";
import { DEFAULT_RECENT_PROJECTS_COUNT } from "@/utils/constants";
import { normalizeApp } from "@/utils/validation";

export const DEFAULT_SETTINGS: ExportedSettings = {
  defaultApp: null,
  onboardingCompleted: false,
  pinnedProjects: [],
  recentProjects: [],
  recentProjectsCount: DEFAULT_RECENT_PROJECTS_COUNT,
  showGitStatus: true,
  showRecentProjects: false,
  terminalApp: null,
  workspaceApps: {},
  workspaces: [],
};

export async function exportSettingsToDownloads(settings: ExportedSettings): Promise<void> {
  try {
    const backup: SettingsBackup = {
      exportedAt: new Date().toISOString(),
      settings,
      version: 1,
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

  return {
    defaultApp: normalizeApp(parsedSettings.defaultApp),
    onboardingCompleted:
      typeof parsedSettings.onboardingCompleted === "boolean"
        ? parsedSettings.onboardingCompleted
        : fallback.onboardingCompleted,
    pinnedProjects: Array.isArray(parsedSettings.pinnedProjects)
      ? parsedSettings.pinnedProjects.filter((value): value is string => typeof value === "string")
      : fallback.pinnedProjects,
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
    showGitStatus:
      typeof parsedSettings.showGitStatus === "boolean" ? parsedSettings.showGitStatus : fallback.showGitStatus,
    showRecentProjects:
      typeof parsedSettings.showRecentProjects === "boolean"
        ? parsedSettings.showRecentProjects
        : fallback.showRecentProjects,
    terminalApp: normalizeApp(parsedSettings.terminalApp),
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

function isRecognizableBackup(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  if (record.version === 1 && record.settings && typeof record.settings === "object") {
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
