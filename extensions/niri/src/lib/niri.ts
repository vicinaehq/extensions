import { exec } from 'child_process';
import { promisify } from 'util';
import { handleError, showSuccess } from './feedback';

export const execAsync = promisify(exec);

export async function runNiriAction(action: string) {
  try {
    await execAsync(`niri msg action ${action}`);
    return true;
  } catch (error) {
    console.error(error);
    handleError('Action failed', error);
    return false;
  }
}

export async function runNiriCommand(command: string) {
  try {
    await execAsync(`niri msg ${command}`);
    return true;
  } catch (error) {
    console.error(error);
    handleError('Command failed', error);
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
