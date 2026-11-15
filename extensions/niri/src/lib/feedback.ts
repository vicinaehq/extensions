import { showToast, Toast } from '@vicinae/api';

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
