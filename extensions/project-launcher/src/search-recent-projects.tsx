import { Action, ActionPanel, Color, List, showToast, Toast, getPreferenceValues } from "@vicinae/api";
import { homedir } from "os";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { execSync, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface Preferences {
  programName: string;
  terminalPreset: string;
  customTerminalCommand: string;
}

/**
 * Checks if a command exists in the system PATH
 */
async function checkCommandExists(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the display name for a terminal preset
 */
function getTerminalDisplayName(preset: string): string {
  const displayNames: Record<string, string> = {
    "gnome-terminal": "GNOME Terminal",
    "konsole": "Konsole",
    "alacritty": "Alacritty",
    "kitty": "Kitty",
    "ghostty": "Ghostty",
    "tilix": "Tilix",
    "wezterm": "WezTerm",
    "xterm": "xterm",
  };

  return displayNames[preset] || "terminal";
}

/**
 * Gets the terminal command configuration for a given preset
 */
function getTerminalConfig(preset: string, folderPath: string): { command: string; fullCommand: string } | null {
  const configs: Record<string, { command: string; template: string }> = {
    "gnome-terminal": { command: "gnome-terminal", template: `gnome-terminal --working-directory="${folderPath}"` },
    "konsole": { command: "konsole", template: `konsole --workdir "${folderPath}"` },
    "alacritty": { command: "alacritty", template: `alacritty --working-directory "${folderPath}"` },
    "kitty": { command: "kitty", template: `kitty --directory "${folderPath}"` },
    "ghostty": { command: "ghostty", template: `ghostty --working-directory="${folderPath}"` },
    "tilix": { command: "tilix", template: `tilix --working-directory="${folderPath}"` },
    "wezterm": { command: "wezterm", template: `wezterm start --cwd "${folderPath}"` },
    "xterm": { command: "xterm", template: `xterm -e "cd \\"${folderPath}\\" && exec $SHELL"` },
  };

  const config = configs[preset];
  if (config) {
    return {
      command: config.command,
      fullCommand: config.template,
    };
  }
  return null;
}

/**
 * Opens a folder in the system's terminal
 * Uses preset configuration or custom command template
 */
async function openInTerminal(folderPath: string, preset: string, customCommand: string): Promise<void> {
  // Handle custom terminal command
  if (preset === "custom") {
    if (!customCommand || customCommand.trim() === "") {
      throw new Error("Custom terminal command is not configured. Please set it in extension settings.");
    }

    // Replace {path} placeholder with actual folder path
    const fullCommand = customCommand.replace(/\{path\}/g, `"${folderPath}"`);

    // Extract the command name (first word) for existence check
    const commandName = customCommand.trim().split(/\s+/)[0];

    if (!(await checkCommandExists(commandName))) {
      throw new Error(`Custom terminal command '${commandName}' not found. Please check your configuration.`);
    }

    await execAsync(fullCommand);
    return;
  }

  // Handle specific preset
  if (preset !== "auto-detect") {
    const config = getTerminalConfig(preset, folderPath);

    if (config) {
      if (await checkCommandExists(config.command)) {
        await execAsync(config.fullCommand);
        return;
      } else {
        throw new Error(`${preset} is not installed or not in your PATH. Please install it or choose a different terminal.`);
      }
    }
  }

  // Auto-detect: try common terminals in order of preference
  const terminalsToTry = ["gnome-terminal", "konsole", "alacritty", "kitty", "ghostty", "tilix", "wezterm", "xterm"];

  for (const terminalPreset of terminalsToTry) {
    const config = getTerminalConfig(terminalPreset, folderPath);
    if (config && (await checkCommandExists(config.command))) {
      try {
        await execAsync(config.fullCommand);
        return;
      } catch {
        // Try next terminal
        continue;
      }
    }
  }

  throw new Error("No supported terminal emulator found. Please install a terminal (gnome-terminal, konsole, alacritty, etc.) or configure a custom terminal in settings.");
}

/**
 * Get the color for a git branch tag
 */
function getBranchColor(_branchName: string): Color {
  return Color.Blue;
}

/**
 * Get the current git branch for a given directory path
 */
function getGitBranch(projectPath: string): string | undefined {
  try {
    const gitDir = join(projectPath, ".git");
    if (!existsSync(gitDir)) {
      return undefined;
    }

    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectPath,
      encoding: "utf8",
      timeout: 2000,
    }).trim();

    return branch || undefined;
  } catch {
    return undefined;
  }
}

interface RecentProject {
  path: string;
  name: string;
  lastModified?: Date;
  gitBranch?: string;
  source: "Positron" | "VS Code" | "Cursor";
  isRemote: boolean;
  remoteHost?: string;
  uri?: string; // Store the original URI for opening
}

/**
 * Parse a workspace URI and extract project information
 * Handles both local (file://) and remote (vscode-remote://ssh-remote+) URIs
 */
function parseWorkspaceUri(uri: string): {
  path: string;
  name: string;
  isRemote: boolean;
  remoteHost?: string;
} | null {
  try {
    // Handle local file URIs
    if (uri.startsWith("file://")) {
      const path = uri.replace("file://", "");
      const decodedPath = decodeURIComponent(path);
      return {
        path: decodedPath,
        name: basename(decodedPath),
        isRemote: false,
      };
    }

    // Handle remote SSH URIs (vscode-remote://ssh-remote+hostname/path/to/project)
    // Note: The + is often URL-encoded as %2B
    const remoteMatch = uri.match(/^vscode-remote:\/\/ssh-remote(?:\+|%2B)([^/]+)(\/.*)?$/);
    if (remoteMatch) {
      const remoteHost = remoteMatch[1];
      const remotePath = remoteMatch[2] || "/";
      const decodedPath = decodeURIComponent(remotePath);
      return {
        path: decodedPath,
        name: basename(decodedPath),
        isRemote: true,
        remoteHost: decodeURIComponent(remoteHost),
      };
    }

    return null;
  } catch (error) {
    console.error("Failed to parse workspace URI:", error);
    return null;
  }
}

/**
 * Get recent projects from a specific editor's workspace storage
 */
function getProjectsFromWorkspaceStorage(editorName: string, configPath: string): RecentProject[] {
  const workspaceStoragePath = join(configPath, "User", "workspaceStorage");

  if (!existsSync(workspaceStoragePath)) {
    return [];
  }

  const projects: RecentProject[] = [];
  const workspaceDirs = readdirSync(workspaceStoragePath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const workspaceDir of workspaceDirs) {
    const workspaceJsonPath = join(workspaceStoragePath, workspaceDir, "workspace.json");

    if (existsSync(workspaceJsonPath)) {
      try {
        const workspaceData = JSON.parse(readFileSync(workspaceJsonPath, "utf8"));
        if (workspaceData.folder) {
          const folderUri = workspaceData.folder;
          const parsedUri = parseWorkspaceUri(folderUri);

          if (parsedUri) {
            // For local projects, check if they still exist
            // For remote projects, always add them (we can't check remote filesystem easily)
            if (parsedUri.isRemote || existsSync(parsedUri.path)) {
              // Only get git branch for local projects
              const gitBranch = parsedUri.isRemote ? undefined : getGitBranch(parsedUri.path);

              projects.push({
                path: parsedUri.path,
                name: parsedUri.name,
                gitBranch,
                source: editorName as "Positron" | "VS Code" | "Cursor",
                isRemote: parsedUri.isRemote,
                remoteHost: parsedUri.remoteHost,
                uri: folderUri,
              });
            }
          }
        }
      } catch (error) {
        console.error(`Failed to parse workspace.json in ${workspaceDir}:`, error);
      }
    }
  }

  return projects
    .map((project) => {
      const workspaceDir = workspaceDirs.find((dir) => {
        const workspaceJsonPath = join(workspaceStoragePath, dir, "workspace.json");
        if (existsSync(workspaceJsonPath)) {
          try {
            const workspaceData = JSON.parse(readFileSync(workspaceJsonPath, "utf8"));
            // Match by the original URI instead of just the path
            return workspaceData.folder && workspaceData.folder === project.uri;
          } catch {
            return false;
          }
        }
        return false;
      });

      if (workspaceDir) {
        const statePath = join(workspaceStoragePath, workspaceDir, "state.vscdb");
        const stats = existsSync(statePath) ? statSync(statePath) : null;
        return {
          ...project,
          lastModified: stats?.mtime || new Date(0),
        };
      }
      return { ...project, lastModified: new Date(0) };
    });
}

/**
 * Map program names to their config directories and display names
 */
function getEditorConfig(programName: string): { configDir: string; displayName: string } | null {
  const homeDir = homedir();
  const lowerProgram = programName.toLowerCase();

  if (lowerProgram === "positron") {
    return {
      configDir: join(homeDir, ".config", "Positron"),
      displayName: "Positron",
    };
  }

  if (lowerProgram === "code" || lowerProgram === "vscode" || lowerProgram === "code-insiders") {
    return {
      configDir: join(homeDir, ".config", "Code"),
      displayName: "VS Code",
    };
  }

  if (lowerProgram === "cursor") {
    return {
      configDir: join(homeDir, ".config", "Cursor"),
      displayName: "Cursor",
    };
  }

  return null;
}

/**
 * Get recent projects for the configured editor
 */
function getRecentProjects(programName: string): RecentProject[] {
  const editorConfig = getEditorConfig(programName);

  if (!editorConfig) {
    return [];
  }

  const { configDir, displayName } = editorConfig;

  if (!existsSync(configDir)) {
    return [];
  }

  const projects = getProjectsFromWorkspaceStorage(displayName, configDir);

  // Sort by last modified date (most recent first) and limit to 50 projects
  return projects
    .sort((a, b) => (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0))
    .slice(0, 50);
}

async function openInEditor(pathOrUri: string, programName: string) {
  try {
    // Check if this is a URI (remote or local)
    const isUri = pathOrUri.startsWith("file://") || pathOrUri.startsWith("vscode-remote://");

    let command: string;
    let displayName: string;

    if (isUri) {
      // For URIs, use --folder-uri flag
      command = `${programName} --folder-uri "${pathOrUri}"`;
      displayName = pathOrUri.split("/").pop() || pathOrUri;
    } else {
      // For regular paths, use the path directly
      command = `${programName} "${pathOrUri}"`;
      displayName = basename(pathOrUri);
    }

    execSync(command, {
      stdio: "ignore",
      timeout: 5000,
    });

    // Get properly capitalized editor name for display
    const editorConfig = getEditorConfig(programName);
    const editorDisplayName = editorConfig?.displayName || programName;

    await showToast({
      title: `Opened in ${editorDisplayName}`,
      message: displayName,
      style: Toast.Style.Success,
    });
  } catch {
    // Get properly capitalized editor name for display
    const editorConfig = getEditorConfig(programName);
    const editorDisplayName = editorConfig?.displayName || programName;

    await showToast({
      title: `Failed to open in ${editorDisplayName}`,
      message: `Make sure ${editorDisplayName} is installed and in your PATH`,
      style: Toast.Style.Failure,
    });
  }
}

async function openProjectInTerminal(project: RecentProject, preset: string, customCommand: string) {
  // Only open local projects in terminal
  // Remote projects can't be opened in local terminal
  if (project.isRemote) {
    await showToast({
      title: "Cannot open remote project in terminal",
      message: `${project.remoteHost}:${project.path} is a remote project`,
      style: Toast.Style.Failure,
    });
    return;
  }

  try {
    await openInTerminal(project.path, preset, customCommand);
    await showToast({
      title: "Opened in terminal",
      message: project.name,
      style: Toast.Style.Success,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to open terminal";
    await showToast({
      title: "Failed to open terminal",
      message: errorMessage,
      style: Toast.Style.Failure,
    });
  }
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const projects = getRecentProjects(preferences.programName);

  // Get properly capitalized editor name for display
  const editorConfig = getEditorConfig(preferences.programName);
  const editorDisplayName = editorConfig?.displayName || preferences.programName;

  // Get terminal action title based on preset
  const terminalActionTitle = (() => {
    if (preferences.terminalPreset === "auto-detect" || preferences.terminalPreset === "custom") {
      return "Open in terminal";
    }
    const terminalName = getTerminalDisplayName(preferences.terminalPreset);
    return `Open in ${terminalName}`;
  })();

  return (
    <List searchBarPlaceholder="Search recent projects...">
      {projects.length === 0 ? (
        <List.EmptyView
          title="No recent projects found"
          description={`Make sure ${editorDisplayName} has been used recently`}
        />
      ) : (
        projects.map((project, index) => (
          <List.Item
            key={index}
            title={project.name}
            subtitle={project.isRemote ? `${project.remoteHost}:${project.path}` : project.path}
            accessories={[
              ...(project.isRemote
                ? [
                    {
                      tag: {
                        value: `SSH: ${project.remoteHost}`,
                        color: Color.Magenta,
                      },
                      tooltip: `Remote SSH: ${project.remoteHost}`,
                    },
                  ]
                : []),
              ...(project.gitBranch
                ? [
                    {
                      tag: {
                        value: project.gitBranch,
                        color: getBranchColor(project.gitBranch),
                      },
                      tooltip: `Git Branch: ${project.gitBranch}`,
                    },
                  ]
                : []),
            ]}
            actions={
              <ActionPanel>
                <Action
                  title={`Open in ${editorDisplayName}`}
                  onAction={async () => await openInEditor(project.uri || project.path, preferences.programName)}
                />
                {!project.isRemote && (
                  <Action
                    title={terminalActionTitle}
                    onAction={async () => await openProjectInTerminal(project, preferences.terminalPreset, preferences.customTerminalCommand)}
                  />
                )}
                <Action.CopyToClipboard title="Copy Path" content={project.path} />
                {project.remoteHost && (
                  <Action.CopyToClipboard title="Copy Remote Host" content={project.remoteHost} />
                )}
                {project.gitBranch && <Action.CopyToClipboard title="Copy Git Branch" content={project.gitBranch} />}
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
