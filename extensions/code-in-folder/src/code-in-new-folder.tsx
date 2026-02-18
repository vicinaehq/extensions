import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  runInTerminal,
  showInFileBrowser,
} from "@vicinae/api";
import { exec } from "child_process";
import { mkdir, access, stat } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import { promisify } from "util";
import { constants } from "fs";
import { useState } from "react";
import { toCamelCase, toKebabCase, toLowerCase, toSnakeCase } from "js-convert-case";

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const MAX_TITLE_CHARS = 50;
const MAX_TITLE_WORDS = 10;
const PLACEHOLDER_FOLDER = "[NEWFOLDER]";

const EDITOR_DISPLAY_NAMES: Record<string, string> = {
  positron: "Positron",
  code: "VS Code",
  codium: "VS Codium",
  cursor: "Cursor",
};

// ============================================================================
// Types
// ============================================================================

interface FormValues {
  title: string;
}

interface Preferences {
  basePath: string;
  programName: string;
  customEditorCommand: string;
  runCustomEditorInTerminal: boolean;
  addYearToPath: boolean;
  addMonthDayToPath: boolean;
  pathNameCase: string;
  truncatePathName: boolean;
  openExistingFolder: boolean;
  openSpecificFile: boolean;
  specificFileName: string;
}

interface EditorConfig {
  programName: string;
  runInTerminal: boolean;
  displayName: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface DateParts {
  year: string;
  month: string;
  day: string;
  dateFolder: string;
}

interface PathConstructionOptions {
  basePath: string;
  overrideBasePath: string;
  processedTitle: string;
  dateParts: DateParts;
  addYearToPath: boolean;
  addMonthDayToPath: boolean;
}

interface SubmitDependencies {
  preferences: Preferences;
  editorConfig: EditorConfig;
  fileName: string;
  overrideBasePath: string;
  expandedBasePath: string;
  dateParts: DateParts;
}

type SubmitAction = "editor" | "terminal" | "fileBrowser";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Expands and normalizes paths:
 * - Empty string defaults to home directory
 * - Tilde (~) expands to home directory
 * - Absolute paths (starting with /) are used as-is
 * - Relative paths are resolved from home directory
 */
function expandPath(path: string): string {
  if (!path || path.trim() === "") {
    return homedir();
  }

  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }

  if (path.startsWith("/")) {
    return path;
  }

  return join(homedir(), path);
}

/**
 * Gets the word separator character for a given case option
 */
function getSeparatorForCase(caseOption: string): string {
  if (caseOption === "snake_case") return "_";
  if (caseOption === "kebab-case") return "-";
  return "";
}

/**
 * Applies case conversion to a string based on the selected option
 */
function applyCaseConversion(text: string, caseOption: string): string {
  if (caseOption === "none") return text;

  switch (caseOption) {
    case "camelCase":
      return toCamelCase(text);
    case "kebab-case":
      return toKebabCase(text);
    case "lowercase":
      return toLowerCase(text);
    case "snake_case":
      return toSnakeCase(text);
    default:
      return text;
  }
}

/**
 * Truncates text by word count using the given separator
 */
function truncateByWords(text: string, separator: string, maxWords: number): string {
  if (!separator) return text;

  const words = text.split(separator).filter((w) => w.length > 0);
  if (words.length <= maxWords) return text;

  return words.slice(0, maxWords).join(separator);
}

/**
 * Truncates text by character count
 */
function truncateByCharacters(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars);
}

/**
 * Removes trailing separator characters from text
 */
function cleanTrailingSeparators(text: string, separator: string): string {
  if (!separator) return text;

  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escapedSeparator}+$`);
  return text.replace(regex, "");
}

/**
 * Processes a title for use as a path component:
 * - Applies case conversion based on the caseOption (camelCase, kebab-case, lowercase, snake_case, or none)
 * - Removes special characters (except for "none" option)
 * - Optionally truncates to max 50 characters or 10 words (if truncatePathName is true)
 */
function processTitle(title: string, caseOption: string, truncate: boolean): string {
  let processed = title.trim();

  // Apply case conversion
  processed = applyCaseConversion(processed, caseOption);

  // Truncate if needed
  if (truncate && processed.length > 0) {
    const separator = getSeparatorForCase(caseOption);

    // Truncate by word count first (if separator exists)
    if (separator) {
      processed = truncateByWords(processed, separator, MAX_TITLE_WORDS);
    }

    // Then truncate by character count
    processed = truncateByCharacters(processed, MAX_TITLE_CHARS);

    // Clean up any trailing separators after truncation
    processed = cleanTrailingSeparators(processed, separator);
  }

  return processed;
}

/**
 * Gets current date parts for path construction
 */
function getDateParts(): DateParts {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateFolder = `${month}-${day}`;

  return { year, month, day, dateFolder };
}

/**
 * Checks if a directory exists
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Gets a user-friendly error message for editor opening failures
 */
function getEditorErrorMessage(error: unknown, programName: string): string {
  if (!(error instanceof Error)) {
    return "Failed to open editor";
  }

  const errorString = error.message.toLowerCase();

  if (errorString.includes("not found") || errorString.includes("command not found")) {
    return `Command '${programName}' not found. Please install it or update the editor command in settings.`;
  }

  if (errorString.includes("permission denied")) {
    return `Permission denied when running '${programName}'. Check file permissions.`;
  }

  return error.message;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates that a program name is safe to use in a shell command
 * Prevents shell injection by checking for dangerous characters
 */
function validateProgramName(programName: string): ValidationResult {
  if (!programName || programName.trim() === "") {
    return { valid: false, error: "Editor program name cannot be empty" };
  }

  const dangerousChars = /[;&|`$(){}[\]<>*?~!#\n\r]/;
  if (dangerousChars.test(programName)) {
    return {
      valid: false,
      error: "Editor program name contains invalid characters. Use only letters, numbers, hyphens, underscores, and forward slashes.",
    };
  }

  if (/\s/.test(programName.trim())) {
    return {
      valid: false,
      error: "Editor program name should be a single command (e.g., 'code', not 'code --new-window')",
    };
  }

  return { valid: true };
}

/**
 * Validates that the base path is writable
 */
async function validateBasePath(path: string): Promise<ValidationResult> {
  // Try accessing the path directly
  try {
    await access(path, constants.W_OK);
    return { valid: true };
  } catch {
    // Path not writable, try parent directory
  }

  // Try accessing the parent directory
  try {
    const parentDir = dirname(path);
    await access(parentDir, constants.W_OK);
    return { valid: true };
  } catch {
    // Neither path nor parent is writable
  }

  return {
    valid: false,
    error: `Cannot write to base directory or its parent: ${path}. Please check the path and permissions in settings.`,
  };
}

// ============================================================================
// Editor Configuration
// ============================================================================

/**
 * Gets the effective editor command and whether it should run in terminal
 */
function getEffectiveEditorConfig(preferences: Preferences): EditorConfig {
  if (preferences.programName === "other") {
    const customCommand = preferences.customEditorCommand.trim();
    return {
      programName: customCommand || "vim",
      runInTerminal: preferences.runCustomEditorInTerminal,
      displayName: customCommand || "Custom Editor",
    };
  }

  return {
    programName: preferences.programName,
    runInTerminal: false,
    displayName: EDITOR_DISPLAY_NAMES[preferences.programName.toLowerCase()] || preferences.programName,
  };
}

// ============================================================================
// Path Construction
// ============================================================================

/**
 * Constructs the full folder path based on preferences and options
 */
function constructFullPath(options: PathConstructionOptions): string {
  const { basePath, overrideBasePath, processedTitle, dateParts, addYearToPath, addMonthDayToPath } = options;

  const isUsingOverride = overrideBasePath.trim() !== "";
  const effectiveBasePath = isUsingOverride ? expandPath(overrideBasePath.trim()) : basePath;

  const pathParts = [effectiveBasePath];

  // Only add year/date subdirectories if NOT using override
  if (!isUsingOverride) {
    if (addYearToPath) {
      pathParts.push(dateParts.year);
    }

    if (addMonthDayToPath) {
      pathParts.push(dateParts.dateFolder);
    }
  }

  pathParts.push(processedTitle);

  return join(...pathParts);
}

/**
 * Constructs the display path for showing to the user
 */
function constructDisplayPath(
  basePath: string,
  overrideBasePath: string,
  processedTitle: string,
  dateParts: DateParts,
  addYearToPath: boolean,
  addMonthDayToPath: boolean
): string {
  const isUsingOverride = overrideBasePath.trim() !== "";
  let displayBasePath: string;

  if (isUsingOverride) {
    const trimmedOverride = overrideBasePath.trim();
    if (!trimmedOverride.startsWith("/") && !trimmedOverride.startsWith("~")) {
      displayBasePath = `~/${trimmedOverride}`;
    } else {
      displayBasePath = trimmedOverride;
    }
  } else {
    displayBasePath = basePath.trim() === "" ? "~" : basePath;
  }

  const displayPathParts = [displayBasePath];

  // Only add year/date subdirectories if NOT using override
  if (!isUsingOverride) {
    if (addYearToPath) {
      displayPathParts.push(dateParts.year);
    }

    if (addMonthDayToPath) {
      displayPathParts.push(dateParts.dateFolder);
    }
  }

  displayPathParts.push(processedTitle);

  return displayPathParts.join("/");
}

// ============================================================================
// Folder Management
// ============================================================================

/**
 * Validates and creates a folder if needed
 * Returns true if successful, false otherwise (toast messages are shown internally)
 */
async function ensureFolderExists(
  fullPath: string,
  processedTitle: string,
  originalTitle: string,
  allowExisting: boolean
): Promise<boolean> {
  const folderExists = await directoryExists(fullPath);

  if (folderExists) {
    if (!allowExisting) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error: Folder Already Exists",
        message: `The folder "${processedTitle}" already exists. Enable "Open Existing Folders" in settings to open it anyway.`,
      });
      return false;
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Folder Already Exists",
      message: `Opening existing folder: ${processedTitle}`,
    });
  } else {
    try {
      await mkdir(fullPath, { recursive: true });
      await showToast({
        style: Toast.Style.Success,
        title: "Folder Created",
        message: processedTitle !== originalTitle ? `Created as: ${processedTitle}` : `Created ${fullPath}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await showToast({
        style: Toast.Style.Failure,
        title: "Error Creating Folder",
        message: `Cannot create directory: ${errorMessage}. Check base path in settings.`,
      });
      return false;
    }
  }

  return true;
}

// ============================================================================
// Editor Opening Functions
// ============================================================================

/**
 * Opens a folder in the configured editor
 * Returns true if successful, false if error (toast shown internally)
 */
async function openInEditor(
  fullPath: string,
  editorConfig: EditorConfig,
  openSpecificFile: boolean,
  fileName: string
): Promise<boolean> {
  try {
    if (editorConfig.runInTerminal) {
      const userShell = process.env.SHELL || "/bin/bash";
      const target = openSpecificFile && fileName.trim() ? fileName.trim() : ".";
      await runInTerminal([userShell, "-c", `cd "${fullPath}" && exec ${editorConfig.programName} ${target}`]);
    } else {
      if (openSpecificFile && fileName.trim()) {
        const filePath = join(fullPath, fileName.trim());
        await execAsync(`${editorConfig.programName} "${fullPath}" "${filePath}"`);
      } else {
        await execAsync(`${editorConfig.programName} "${fullPath}"`);
      }
    }
    await closeMainWindow();
    return true;
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Error Opening Editor",
      message: getEditorErrorMessage(error, editorConfig.programName),
    });
    return false;
  }
}

/**
 * Opens a folder in the terminal
 * Returns true if successful, false if error (toast shown internally)
 */
async function openInTerminal(fullPath: string): Promise<boolean> {
  try {
    const userShell = process.env.SHELL || "/bin/bash";
    await runInTerminal([userShell, "-c", `cd "${fullPath}" && exec ${userShell}`]);
    await closeMainWindow();
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to open terminal";
    await showToast({
      style: Toast.Style.Failure,
      title: "Error Opening Terminal",
      message: errorMessage,
    });
    return false;
  }
}

/**
 * Opens a folder in the file browser
 * Returns true if successful, false if error (toast shown internally)
 */
async function openInFileBrowser(fullPath: string): Promise<boolean> {
  try {
    await showInFileBrowser(fullPath);
    await closeMainWindow();
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to open file browser";
    await showToast({
      style: Toast.Style.Failure,
      title: "Error Opening File Browser",
      message: errorMessage,
    });
    return false;
  }
}

// ============================================================================
// Form Submission Handler
// ============================================================================

/**
 * Unified submit handler for all three submission actions
 * Handles validation, folder creation, and opening in the chosen mode
 */
async function handleFormSubmit(
  values: FormValues,
  action: SubmitAction,
  deps: SubmitDependencies
): Promise<void> {
  const { title } = values;
  const { preferences, editorConfig, fileName, overrideBasePath, expandedBasePath, dateParts } = deps;

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
  const processedTitle = processTitle(title, preferences.pathNameCase, preferences.truncatePathName);

  if (!processedTitle) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Invalid Title",
      message: "Title must contain at least one valid character",
    });
    return;
  }

  // Validate program name before proceeding (only needed for editor action)
  if (action === "editor") {
    const programValidation = validateProgramName(editorConfig.programName);
    if (!programValidation.valid) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid Editor Configuration",
        message: programValidation.error || "Please check your editor program name in extension settings",
      });
      return;
    }
  }

  // Construct the full path
  const fullPath = constructFullPath({
    basePath: expandedBasePath,
    overrideBasePath,
    processedTitle,
    dateParts,
    addYearToPath: preferences.addYearToPath,
    addMonthDayToPath: preferences.addMonthDayToPath,
  });

  // Ensure folder exists (creates if needed, validates if exists)
  const folderReady = await ensureFolderExists(fullPath, processedTitle, title, preferences.openExistingFolder);
  if (!folderReady) {
    return;
  }

  // Open in the appropriate mode (errors handled internally with toasts)
  switch (action) {
    case "editor":
      await openInEditor(fullPath, editorConfig, preferences.openSpecificFile, fileName);
      break;
    case "terminal":
      await openInTerminal(fullPath);
      break;
    case "fileBrowser":
      await openInFileBrowser(fullPath);
      break;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function CodeInFolder() {
  const preferences = getPreferenceValues<Preferences>();
  const expandedBasePath = expandPath(preferences.basePath);

  const [title, setTitle] = useState("");
  const [overrideBasePath, setOverrideBasePath] = useState("");
  const [fileName, setFileName] = useState(preferences.specificFileName);

  const editorConfig = getEffectiveEditorConfig(preferences);
  const programValidation = validateProgramName(editorConfig.programName);
  const hasConfigIssue = !programValidation.valid;

  const dateParts = getDateParts();

  // Build display path
  const processedTitle = title.trim()
    ? processTitle(title, preferences.pathNameCase, preferences.truncatePathName)
    : PLACEHOLDER_FOLDER;

  const displayPath = constructDisplayPath(
    preferences.basePath,
    overrideBasePath,
    processedTitle,
    dateParts,
    preferences.addYearToPath,
    preferences.addMonthDayToPath
  );

  // Prepare dependencies for form submission
  const submitDeps: SubmitDependencies = {
    preferences,
    editorConfig,
    fileName,
    overrideBasePath,
    expandedBasePath,
    dateParts,
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={
              preferences.openSpecificFile && fileName.trim()
                ? `Open folder and file in ${editorConfig.displayName}`
                : `Open folder in ${editorConfig.displayName}`
            }
            onSubmit={(values) => handleFormSubmit(values, "editor", submitDeps)}
          />
          <Action.SubmitForm
            title="Open folder in terminal"
            onSubmit={(values) => handleFormSubmit(values, "terminal", submitDeps)}
          />
          <Action.SubmitForm
            title="Open folder in file browser"
            onSubmit={(values) => handleFormSubmit(values, "fileBrowser", submitDeps)}
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
      <Form.Description title="Folder Path" text={displayPath} />
      <Form.TextField
        id="overrideBasePath"
        title="Override Base Path"
        placeholder="~/custom/path or /tmp/experiments"
        info="Optional - leave empty to use default configured base path"
        value={overrideBasePath}
        onChange={setOverrideBasePath}
      />
      {preferences.openSpecificFile && (
        <Form.TextField
          id="fileName"
          title="File to Open"
          placeholder="main.py"
          info="The file will be created if it doesn't exist"
          value={fileName}
          onChange={setFileName}
        />
      )}
      <Form.Description text={`This path will be created and opened by ${editorConfig.displayName}`} />
    </Form>
  );
}
