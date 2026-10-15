import { showToast, Toast } from "@vicinae/api";
import { errorMessage } from "./format";

export async function showError(title: string, error: unknown): Promise<void> {
  console.error(title, error);
  await showToast({ style: Toast.Style.Failure, title, message: errorMessage(error) });
}
