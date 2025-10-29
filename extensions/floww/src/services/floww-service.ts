import type { Workflow } from "../types/workflow";
import {
  executeFlowwCommand,
  executeFlowwCommandSilent,
  isFlowwAvailable,
} from "../utils/command-executor";
import { SUCCESS_MESSAGES, WORKFLOW_ACTIONS } from "../utils/constants";
import { handleCommandError, showErrorToast, showSuccessToast } from "../utils/error-handler";
import {
  configDirectoryExists,
  getEnrichedWorkflows,
  workflowsDirectoryExists,
} from "./file-system-service";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface SetupStatus {
  installed: boolean;
  configExists: boolean;
  workflowsExist: boolean;
}

/**
 * Check if Floww is properly installed and configured
 */
export async function checkFlowwSetup(): Promise<SetupStatus> {
  const installed = await isFlowwAvailable();

  if (!installed) {
    return { installed: false, configExists: false, workflowsExist: false };
  }

  try {
    const configExists = await configDirectoryExists();
    const workflowsExist = await workflowsDirectoryExists();

    return { installed, configExists, workflowsExist };
  } catch (error) {
    const flowwError = handleCommandError(error, "setup check");
    console.error("Setup check failed:", flowwError);
    return { installed, configExists: false, workflowsExist: false };
  }
}

/**
 * Apply a workflow by name
 */
export async function applyWorkflow(workflowName: string): Promise<void> {
  const result = await executeFlowwCommand(WORKFLOW_ACTIONS.APPLY, [workflowName]);

  if (result.success) {
    await showSuccessToast(`${SUCCESS_MESSAGES.WORKFLOW_APPLIED}: "${workflowName}"`);
  }
  // Error handling is done in CommandExecutor
}

/**
 * Validate a workflow by name
 */
export async function validateWorkflow(workflowName: string): Promise<ValidationResult> {
  const result = await executeFlowwCommandSilent(WORKFLOW_ACTIONS.VALIDATE, [workflowName]);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    error: result.error || "Unknown validation error",
  };
}

/**
 * Get Floww version
 */
export async function getFlowwVersion(): Promise<string> {
  const result = await executeFlowwCommandSilent(WORKFLOW_ACTIONS.VERSION);

  if (result.success) {
    return result.stdout || "Unknown";
  }

  return "Unknown";
}

/**
 * Show Floww version in a toast notification
 */
export async function showFlowwVersion(): Promise<void> {
  try {
    const version = await getFlowwVersion();
    await showSuccessToast(version, "Floww Version");
  } catch (error) {
    const flowwError = handleCommandError(error, "version check");
    await showErrorToast(flowwError, "Version Error");
  }
}

/**
 * Get all available workflows
 */
export async function getWorkflows(): Promise<Workflow[]> {
  try {
    return await getEnrichedWorkflows();
  } catch (error) {
    const flowwError = handleCommandError(error, "get workflows");
    throw new Error(flowwError.message);
  }
}
