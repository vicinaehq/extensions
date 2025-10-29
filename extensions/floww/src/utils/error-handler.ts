import { showToast } from "@vicinae/api";
import type { FlowwError } from "../types/workflow";

/**
 * Handle command execution errors with proper categorization
 */
export function handleCommandError(error: unknown, context: string): FlowwError {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Categorize errors based on common patterns
  if (errorMessage.includes("ENOENT") || errorMessage.includes("not found")) {
    return {
      message: `Command not found: ${context}`,
      code: "CLI_NOT_FOUND",
    };
  }

  if (errorMessage.includes("EACCES") || errorMessage.includes("permission denied")) {
    return {
      message: `Permission denied: ${context}`,
      code: "EXECUTION_ERROR",
    };
  }

  if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
    return {
      message: `Command timed out: ${context}`,
      code: "EXECUTION_ERROR",
    };
  }

  if (errorMessage.includes("parse") || errorMessage.includes("JSON")) {
    return {
      message: `Parse error: ${context}`,
      code: "PARSE_ERROR",
    };
  }

  // Default to execution error
  return {
    message: `${context}: ${errorMessage}`,
    code: "EXECUTION_ERROR",
  };
}

/**
 * Handle file system errors
 */
export function handleFileSystemError(error: unknown, filePath: string): FlowwError {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes("ENOENT")) {
    return {
      message: `File not found: ${filePath}`,
      code: "CONFIG_MISSING",
    };
  }

  if (errorMessage.includes("EACCES")) {
    return {
      message: `Permission denied: ${filePath}`,
      code: "EXECUTION_ERROR",
    };
  }

  return {
    message: `File system error: ${filePath} - ${errorMessage}`,
    code: "EXECUTION_ERROR",
  };
}

/**
 * Handle workflow parsing errors
 */
export function handleParseError(error: unknown, filePath: string): FlowwError {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    message: `Failed to parse workflow: ${filePath} - ${errorMessage}`,
    code: "PARSE_ERROR",
  };
}

/**
 * Show error toast with consistent formatting
 */
export async function showErrorToast(error: FlowwError, title: string = "Error"): Promise<void> {
  await showToast({
    title,
    message: error.message,
  });
}

/**
 * Show success toast with consistent formatting
 */
export async function showSuccessToast(message: string, title: string = "Success"): Promise<void> {
  await showToast({
    title,
    message,
  });
}

/**
 * Create a standardized error for missing workflows
 */
export function createNoWorkflowsError(): FlowwError {
  return {
    message: "No workflows found. Create some workflows using 'floww add' command",
    code: "NO_WORKFLOWS",
  };
}

/**
 * Create a standardized error for missing configuration
 */
export function createConfigMissingError(): FlowwError {
  return {
    message: "Floww configuration not found. Please run 'floww init' first",
    code: "CONFIG_MISSING",
  };
}
