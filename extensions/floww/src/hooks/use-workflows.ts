import { confirmAlert, openExtensionPreferences } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SetupStatus } from "../services/floww-service";
import {
	applyWorkflow,
	checkFlowwSetup,
	editWorkflow,
	getWorkflows,
	removeWorkflow,
	showFlowwVersion,
	validateWorkflow,
} from "../services/floww-service";
import type { Workflow } from "../types/workflow";
import { ERROR_MESSAGES } from "../utils/constants";
import {
	handleCommandError,
	showErrorToast,
	showSuccessToast,
} from "../utils/error-handler";

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
	editWorkflow: (filePath: string) => Promise<void>;
	removeWorkflow: (workflowName: string) => Promise<void>;
	showVersion: () => Promise<void>;
}

export function useWorkflows(): UseWorkflowsState & UseWorkflowsActions {
	const [workflows, setWorkflows] = useState<Workflow[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
	const promptedRef = useRef(false);

	const loadWorkflows = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const status = await checkFlowwSetup();
			setSetupStatus(status);

			if (!status.installed) {
				setError(ERROR_MESSAGES.CLI_NOT_INSTALLED);

				if (!promptedRef.current) {
					promptedRef.current = true;
					const open = await confirmAlert({
						title: "Floww CLI not found",
						message:
							"Set the binary path in extension preferences if floww is installed in a custom location.",
						primaryAction: { title: "Open Preferences" },
						dismissAction: { title: "OK" },
					});

					if (open) {
						await openExtensionPreferences();
					}
				}

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

			const workflowsList = await getWorkflows();
			setWorkflows(workflowsList);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to load workflows";
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
			const flowwError = handleCommandError(
				err,
				`apply workflow: ${workflowName}`,
			);
			await showErrorToast(flowwError, "Apply Workflow Error");
		}
	}, []);

	const handleValidateWorkflow = useCallback(async (workflowName: string) => {
		try {
			const result = await validateWorkflow(workflowName);

			if (result.valid) {
				await showSuccessToast(
					`Workflow "${workflowName}" is valid`,
					"Validation Success",
				);
			} else {
				await showErrorToast(
					{
						message: result.error || "Unknown validation error",
						code: "EXECUTION_ERROR",
					},
					"Validation Failed",
				);
			}
		} catch (err) {
			const flowwError = handleCommandError(
				err,
				`validate workflow: ${workflowName}`,
			);
			await showErrorToast(flowwError, "Validation Error");
		}
	}, []);

	const handleEditWorkflow = useCallback(async (filePath: string) => {
		try {
			await editWorkflow(filePath);
		} catch (err) {
			const flowwError = handleCommandError(err, `edit workflow: ${filePath}`);
			await showErrorToast(flowwError, "Edit Workflow Error");
		}
	}, []);

	const handleRemoveWorkflow = useCallback(
		async (workflowName: string) => {
			try {
				await removeWorkflow(workflowName);
				await loadWorkflows();
			} catch (err) {
				const flowwError = handleCommandError(
					err,
					`remove workflow: ${workflowName}`,
				);
				await showErrorToast(flowwError, "Remove Workflow Error");
			}
		},
		[loadWorkflows],
	);

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
		editWorkflow: handleEditWorkflow,
		removeWorkflow: handleRemoveWorkflow,
		showVersion: handleShowVersion,
	};
}
