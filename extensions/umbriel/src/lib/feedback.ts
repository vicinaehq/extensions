import { Alert, confirmAlert, showToast, Toast } from "@vicinae/api";
import { formatError } from "./format";
import { runAction, runCli } from "./umbriel";

export async function showFailure(
	title: string,
	error: unknown,
): Promise<void> {
	await showToast({
		style: Toast.Style.Failure,
		title,
		message: formatError(error),
	});
}

interface TaskOptions {
	loading: string;
	success: string;
	failure?: string;
	task: () => Promise<unknown>;
	refresh?: () => void | Promise<void>;
}

export async function performTask(options: TaskOptions): Promise<boolean> {
	const toast = await showToast({
		style: Toast.Style.Animated,
		title: options.loading,
	});
	try {
		await options.task();
		toast.style = Toast.Style.Success;
		toast.title = options.success;
		toast.message = undefined;
		try {
			await options.refresh?.();
		} catch (refreshError) {
			await showFailure(
				"Action succeeded but the list could not refresh",
				refreshError,
			);
		}
		return true;
	} catch (error) {
		toast.style = Toast.Style.Failure;
		toast.title = options.failure ?? options.loading;
		toast.message = formatError(error);
		return false;
	}
}

interface ActionOptions {
	success: string;
	failure?: string;
	refresh?: () => void | Promise<void>;
	loading?: string;
}

export async function performAction(
	action: string,
	args: string[],
	options: ActionOptions,
): Promise<boolean> {
	return performTask({
		loading: options.loading ?? options.success,
		success: options.success,
		failure: options.failure,
		refresh: options.refresh,
		task: () => runAction(action, ...args),
	});
}

export async function performCli(
	args: string[],
	options: ActionOptions,
): Promise<boolean> {
	return performTask({
		loading: options.loading ?? options.success,
		success: options.success,
		failure: options.failure,
		refresh: options.refresh,
		task: () => runCli(...args),
	});
}

export async function confirmDestructive(
	title: string,
	message: string,
	confirmTitle = "Continue",
): Promise<boolean> {
	return confirmAlert({
		title,
		message,
		icon: undefined,
		primaryAction: {
			title: confirmTitle,
			style: Alert.ActionStyle.Destructive,
		},
		dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
	});
}
