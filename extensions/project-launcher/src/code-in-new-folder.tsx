import { Action, ActionPanel, Form, showToast, Toast, closeMainWindow, getPreferenceValues, Icon } from "@vicinae/api";
import { exec } from "child_process";
import { mkdir, access } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import { promisify } from "util";
import { constants } from "fs";
import { useState } from "react";

const execAsync = promisify(exec);

interface FormValues {
  title: string;
}

interface Preferences {
  basePath: string;
  programName: string;
  terminalPreset: string;
  customTerminalCommand: string;
  addYearToPath: boolean;
  addMonthDayToPath: boolean;
  sanitizePathName: boolean;
  truncatePathName: boolean;
}

/**
 * Expands and normalizes paths:
 * - Empty string defaults to home directory
 * - Tilde (~) expands to home directory
 * - Absolute paths (starting with /) are used as-is
 * - Relative paths are resolved from home directory
 */
function expandPath(path: string): string {
  // If empty, default to home directory
  if (!path || path.trim() === "") {
    return homedir();
  }

  // If starts with ~, expand to home directory
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }

  // Absolute paths (starting with /) are returned as-is
  if (path.startsWith("/")) {
    return path;
  }

  // Relative paths are resolved from home directory
  return join(homedir(), path);
}

/**
 * Processes a title for use as a path component:
 * - Optionally converts to snake_case (if sanitizePathName is true)
 * - Optionally removes special characters (if sanitizePathName is true)
 * - Optionally truncates to max 50 characters or 10 words (if truncatePathName is true)
 */
function processTitle(title: string, sanitize: boolean, truncate: boolean): string {
  // Trim whitespace
  let processed = title.trim();

  if (sanitize) {
    // Convert to lowercase
    processed = processed.toLowerCase();

    // Replace spaces and common separators with underscores
    processed = processed.replace(/[\s\-\.]+/g, "_");

    // Remove special characters (keep only alphanumeric, underscore, and hyphen)
    processed = processed.replace(/[^a-z0-9_\-]/g, "");

    // Collapse multiple underscores into one
    processed = processed.replace(/_+/g, "_");

    // Remove leading/trailing underscores
    processed = processed.replace(/^_+|_+$/g, "");
  }

  if (truncate) {
    if (sanitize) {
      // Truncate by words (max 10 words) - only when sanitized (using underscores)
      const words = processed.split("_").filter((w) => w.length > 0);
      if (words.length > 10) {
        processed = words.slice(0, 10).join("_");
      }
    }

    // Truncate by characters (max 50 characters)
    if (processed.length > 50) {
      processed = processed.substring(0, 50);
      if (sanitize) {
        // Remove trailing underscore if truncation created one
        processed = processed.replace(/_+$/, "");
      }
    }
  }

  return processed;
}

/**
 * Validates that a program name is safe to use in a shell command
 * Prevents shell injection by checking for dangerous characters
 */
function validateProgramName(programName: string): { valid: boolean; error?: string } {
  if (!programName || programName.trim() === "") {
    return { valid: false, error: "Editor program name cannot be empty" };
  }

  // Check for shell metacharacters that could be used for injection
  const dangerousChars = /[;&|`$(){}[\]<>*?~!#\n\r]/;
  if (dangerousChars.test(programName)) {
    return {
      valid: false,
      error: "Editor program name contains invalid characters. Use only letters, numbers, hyphens, underscores, and forward slashes.",
    };
  }

  // Check for multiple words (spaces) which might indicate misconfiguration
  if (/\s/.test(programName.trim())) {
    return {
      valid: false,
      error: "Editor program name should be a single command (e.g., 'code', not 'code --new-window')",
    };
  }

  return { valid: true };
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
 * Validates that the base path is writable
 */
async function validateBasePath(path: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Try to access the directory
    try {
      await access(path, constants.W_OK);
      return { valid: true };
    } catch {
      // Directory might not exist, try to create it or check parent
      const parentDir = dirname(path);
      try {
        await access(parentDir, constants.W_OK);
        return { valid: true };
      } catch {
        return {
          valid: false,
          error: `Cannot write to base directory or its parent: ${path}. Please check the path and permissions in settings.`,
        };
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error validating base path",
    };
  }
}

export default function CodeInFolder() {
  // Get preferences
  const preferences = getPreferenceValues<Preferences>();
  const expandedBasePath = expandPath(preferences.basePath);

  // Track the current title as the user types
  const [title, setTitle] = useState("");

  // Track optional override base path
  const [overrideBasePath, setOverrideBasePath] = useState("");

  // Validate preferences early to provide warnings
  const programValidation = validateProgramName(preferences.programName);
  const hasConfigIssue = !programValidation.valid;

  // Calculate current date for display
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  // Build display path based on preferences and override
  // Use override if provided, otherwise use configured base path
  const isUsingOverride = overrideBasePath.trim() !== "";
  let displayBasePath: string;
  if (isUsingOverride) {
    const trimmedOverride = overrideBasePath.trim();
    // If relative path (doesn't start with / or ~), show as relative to home
    if (!trimmedOverride.startsWith("/") && !trimmedOverride.startsWith("~")) {
      displayBasePath = `~/${trimmedOverride}`;
    } else {
      displayBasePath = trimmedOverride;
    }
  } else {
    // If basePath is empty, show ~ as a friendly indicator of home directory
    displayBasePath = preferences.basePath.trim() === "" ? "~" : preferences.basePath;
  }
  let displayPathParts = [displayBasePath];

  // Only add year/date subdirectories if NOT using override
  if (!isUsingOverride) {
    if (preferences.addYearToPath) {
      displayPathParts.push(String(year));
    }

    if (preferences.addMonthDayToPath) {
      displayPathParts.push(`${month}-${day}`);
    }
  }

  // Process the title for display if it has content
  const processedTitle = title.trim()
    ? processTitle(title, preferences.sanitizePathName, preferences.truncatePathName)
    : "[NEWFOLDER]";

  displayPathParts.push(processedTitle);

  const displayPath = displayPathParts.join("/");

  async function handleSubmit(values: FormValues) {
    const { title } = values;

    // Validate title input
    if (!title || title.trim() === "") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Missing Project Title",
        message: "Please enter a project title to complete the folder path",
      });
      return;
    }

    // Process the title based on preferences
    const processedTitle = processTitle(title, preferences.sanitizePathName, preferences.truncatePathName);

    if (!processedTitle) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid Title",
        message: "Title must contain at least one valid character",
      });
      return;
    }

    // Validate program name before proceeding
    const programValidation = validateProgramName(preferences.programName);
    if (!programValidation.valid) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid Editor Configuration",
        message: programValidation.error || "Please check your editor program name in extension settings",
      });
      return;
    }

    try {
      // Get current date
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const dateFolder = `${month}-${day}`;

      // Construct the full path based on preferences and override
      // Use override if provided, otherwise use configured base path
      const isUsingOverride = overrideBasePath.trim() !== "";
      const effectiveBasePath = isUsingOverride
        ? expandPath(overrideBasePath.trim())
        : expandedBasePath;

      let pathParts = [effectiveBasePath];

      // Only add year/date subdirectories if NOT using override
      if (!isUsingOverride) {
        if (preferences.addYearToPath) {
          pathParts.push(year);
        }

        if (preferences.addMonthDayToPath) {
          pathParts.push(dateFolder);
        }
      }

      pathParts.push(processedTitle);

      const fullPath = join(...pathParts);

      // Create the directory (recursively creates parent directories)
      try {
        await mkdir(fullPath, { recursive: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await showToast({
          style: Toast.Style.Failure,
          title: "Error Creating Folder",
          message: `Cannot create directory: ${errorMessage}. Check base path in settings.`,
        });
        return;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Folder Created",
        message: processedTitle !== title ? `Created as: ${processedTitle}` : `Created ${fullPath}`,
      });

      // Open in the configured editor
      try {
        await execAsync(`${preferences.programName} "${fullPath}"`);
        await closeMainWindow();
      } catch (error) {
        // Provide helpful error message based on error type
        let errorMessage = "Failed to open editor";

        if (error instanceof Error) {
          const errorString = error.message.toLowerCase();

          // Check if it's a "command not found" error
          if (errorString.includes("not found") || errorString.includes("command not found")) {
            errorMessage = `Command '${preferences.programName}' not found. Please install it or update the Editor Program Name in settings.`;
          } else if (errorString.includes("permission denied")) {
            errorMessage = `Permission denied when running '${preferences.programName}'. Check file permissions.`;
          } else {
            errorMessage = error.message;
          }
        }

        await showToast({
          style: Toast.Style.Failure,
          title: "Error Opening Editor",
          message: errorMessage,
        });
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
      });
    }
  }

  async function handleSubmitAndOpenInTerminal(values: FormValues) {
    const { title } = values;

    // Validate title input
    if (!title || title.trim() === "") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Missing Project Title",
        message: "Please enter a project title to complete the folder path",
      });
      return;
    }

    // Process the title based on preferences
    const processedTitle = processTitle(title, preferences.sanitizePathName, preferences.truncatePathName);

    if (!processedTitle) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid Title",
        message: "Title must contain at least one valid character",
      });
      return;
    }

    try {
      // Get current date
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const dateFolder = `${month}-${day}`;

      // Construct the full path based on preferences and override
      const isUsingOverride = overrideBasePath.trim() !== "";
      const effectiveBasePath = isUsingOverride
        ? expandPath(overrideBasePath.trim())
        : expandedBasePath;

      let pathParts = [effectiveBasePath];

      // Only add year/date subdirectories if NOT using override
      if (!isUsingOverride) {
        if (preferences.addYearToPath) {
          pathParts.push(year);
        }

        if (preferences.addMonthDayToPath) {
          pathParts.push(dateFolder);
        }
      }

      pathParts.push(processedTitle);

      const fullPath = join(...pathParts);

      // Create the directory (recursively creates parent directories)
      try {
        await mkdir(fullPath, { recursive: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await showToast({
          style: Toast.Style.Failure,
          title: "Error Creating Folder",
          message: `Cannot create directory: ${errorMessage}. Check base path in settings.`,
        });
        return;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Folder Created",
        message: processedTitle !== title ? `Created as: ${processedTitle}` : `Created ${fullPath}`,
      });

      // Open in terminal
      try {
        await openInTerminal(fullPath, preferences.terminalPreset, preferences.customTerminalCommand);
        await closeMainWindow();
      } catch (error) {
        let errorMessage = "Failed to open terminal";

        if (error instanceof Error) {
          errorMessage = error.message;
        }

        await showToast({
          style: Toast.Style.Failure,
          title: "Error Opening Terminal",
          message: errorMessage,
        });
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
      });
    }
  }

  // Map program name to properly capitalized editor name
  const editorName = (() => {
    switch (preferences.programName.toLowerCase()) {
      case "positron":
        return "Positron";
      case "code":
        return "VS Code";
      case "cursor":
        return "Cursor";
      default:
        return preferences.programName;
    }
  })();

  // Get terminal action title based on preset
  const terminalActionTitle = (() => {
    if (preferences.terminalPreset === "auto-detect" || preferences.terminalPreset === "custom") {
      return "Open folder in terminal";
    }
    const terminalName = getTerminalDisplayName(preferences.terminalPreset);
    return `Open folder in ${terminalName}`;
  })();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title={`Open folder in ${editorName}`} onSubmit={handleSubmit} />
          <Action.SubmitForm title={terminalActionTitle} onSubmit={handleSubmitAndOpenInTerminal} />
          <Action.Open
            title="Open Extension Settings"
            target="vicinae://extensions/code-in-new-folder"
            icon={Icon.Gear}
            shortcut={{ modifiers: ["cmd"], key: "," }}
          />
        </ActionPanel>
      }
    >
      {hasConfigIssue && (
        <Form.Description
          title="⚠️ Configuration Issue"
          text={programValidation.error || "Please check your extension settings"}
        />
      )}
      <Form.TextField
        id="title"
        title="New Folder"
        placeholder="Enter your project name"
        value={title}
        onChange={setTitle}
      />
      <Form.Description
        title="Folder Path"
        text={displayPath}
      />
      <Form.TextField
        id="overrideBasePath"
        title="Override Base Path"
        placeholder="~/custom/path or /tmp/experiments"
        info="Optional - leave empty to use default configured base path"
        value={overrideBasePath}
        onChange={setOverrideBasePath}
      />
      <Form.Description
        text={`This path will be created and opened by ${editorName}`}
      />
    </Form>
  );
}
