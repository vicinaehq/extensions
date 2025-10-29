import { homedir } from "node:os";
import { join } from "node:path";

export const FLOWW_CONFIG = {
  BINARY_PATH: "floww",
  CONFIG_DIR: join(homedir(), ".config", "floww"),
  WORKFLOWS_DIR: join(homedir(), ".config", "floww", "workflows"),
  COMMAND_TIMEOUT: 30000, // 30 seconds
  FILE_READ_TIMEOUT: 5000, // 5 seconds
} as const;

export const SUPPORTED_FILE_EXTENSIONS = [".json", ".yaml", ".yml", ".toml"] as const;

export const WORKFLOW_ACTIONS = {
  APPLY: "apply",
  VALIDATE: "validate",
  VERSION: "--version",
  HELP: "help",
  INIT: "init",
  ADD: "add",
} as const;

export const ERROR_MESSAGES = {
  CLI_NOT_INSTALLED: "Floww CLI is not installed. Please install it first.",
  CONFIG_MISSING: "Floww configuration not found. Please run 'floww init' first.",
  NO_WORKFLOWS: "No workflows directory found. Please run 'floww init' first.",
  WORKFLOW_NOT_FOUND: "Workflow not found",
  VALIDATION_FAILED: "Workflow validation failed",
  EXECUTION_FAILED: "Workflow execution failed",
} as const;

export const SUCCESS_MESSAGES = {
  WORKFLOW_APPLIED: "Workflow applied successfully",
  WORKFLOW_VALID: "Workflow is valid",
  VERSION_RETRIEVED: "Version retrieved successfully",
} as const;
