import { useCallback, useEffect, useState } from "react";
import type { SetupStatus } from "../services/floww-service";
import {
  applyWorkflow,
  checkFlowwSetup,
  getWorkflows,
  showFlowwVersion,
  validateWorkflow,
} from "../services/floww-service";
import type { Workflow } from "../types/workflow";
import { ERROR_MESSAGES } from "../utils/constants";
import { handleCommandError, showErrorToast, showSuccessToast } from "../utils/error-handler";

export interface UseWorkflowsState {
  workflows: Workflow[];
  isLoading: boolean;
  error: string | null;
  setupStatus: SetupStatus | null;
}

export interface UseWorkflowsActions {
  refresh: () => Promise<void>;
  applyWorkflow: (workflowName: string) => Promise<void>;
  validateWorkflow: (workflowName: string) => Promise<void>;
  showVersion: () => Promise<void>;
}

export function useWorkflows(): UseWorkflowsState & UseWorkflowsActions {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

  const loadWorkflows = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check setup status first
      const status = await checkFlowwSetup();
      setSetupStatus(status);

      // Validate setup requirements
      if (!status.installed) {
        setError(ERROR_MESSAGES.CLI_NOT_INSTALLED);
        return;
      }

      if (!status.configExists) {
        setError(ERROR_MESSAGES.CONFIG_MISSING);
        return;
      }

      if (!status.workflowsExist) {
        setError(ERROR_MESSAGES.NO_WORKFLOWS);
        return;
      }

      // Load workflows
      const workflowsList = await getWorkflows();
      setWorkflows(workflowsList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load workflows";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadWorkflows();
  }, [loadWorkflows]);

  const handleApplyWorkflow = useCallback(async (workflowName: string) => {
    try {
      await applyWorkflow(workflowName);
    } catch (err) {
      const flowwError = handleCommandError(err, `apply workflow: ${workflowName}`);
      await showErrorToast(flowwError, "Apply Workflow Error");
    }
  }, []);

  const handleValidateWorkflow = useCallback(async (workflowName: string) => {
    try {
      const result = await validateWorkflow(workflowName);

      if (result.valid) {
        await showSuccessToast(`Workflow "${workflowName}" is valid`, "Validation Success");
      } else {
        await showErrorToast(
          {
            message: result.error || "Unknown validation error",
            code: "EXECUTION_ERROR",
          },
          "Validation Failed"
        );
      }
    } catch (err) {
      const flowwError = handleCommandError(err, `validate workflow: ${workflowName}`);
      await showErrorToast(flowwError, "Validation Error");
    }
  }, []);

  const handleShowVersion = useCallback(async () => {
    await showFlowwVersion();
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  return {
    workflows,
    isLoading,
    error,
    setupStatus,
    refresh,
    applyWorkflow: handleApplyWorkflow,
    validateWorkflow: handleValidateWorkflow,
    showVersion: handleShowVersion,
  };
}
