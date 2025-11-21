import { exec } from 'child_process';
import { promisify } from 'util';
import { showToast, Toast } from '@vicinae/api';

export const execAsync = promisify(exec);

export async function runNiriAction(action: string) {
  try {
    await execAsync(`niri msg action ${action}`);
    return true;
  } catch (error) {
    console.error(error);
    showToast({
      style: Toast.Style.Failure,
      title: 'Action failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

export async function runNiriCommand(command: string) {
  try {
    await execAsync(`niri msg ${command}`);
    return true;
  } catch (error) {
    console.error(error);
    showToast({
      style: Toast.Style.Failure,
      title: 'Command failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

export async function runNiriActionWithRefresh(
  action: string,
  successMessage: string,
  onRefresh: () => Promise<void>
) {
  const success = await runNiriAction(action);
  if (success) {
    showSuccess(successMessage);
    await onRefresh();
  }
  return success;
}

export function handleError(title: string, error: unknown) {
  showToast({
    style: Toast.Style.Failure,
    title,
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}

export function showSuccess(title: string, message?: string) {
  showToast({
    style: Toast.Style.Success,
    title,
    ...(message && { message }),
  });
}
