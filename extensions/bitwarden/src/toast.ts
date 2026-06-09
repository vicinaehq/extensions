import { showToast, Toast } from '@vicinae/api';
import { getErrorMessage } from './bw-executor';

export async function showFailureToast(err: unknown, title: string): Promise<string> {
  const message = getErrorMessage(err);
  await showToast({ style: Toast.Style.Failure, title, message });
  return message;
}
