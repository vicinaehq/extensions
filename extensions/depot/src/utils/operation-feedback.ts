import { Toast, sendDesktopNotification } from "@vicinae/api";
import type { SoftwareOperationStatus } from "../types.ts";

export interface OperationFeedback {
  status: "success" | "failure";
  title: string;
  message: string;
}

export function reportOperationResult(
  toast: Toast,
  feedback: OperationFeedback,
): void {
  toast.style = feedback.status === "success"
    ? Toast.Style.Success
    : Toast.Style.Failure;
  toast.title = feedback.title;
  toast.message = feedback.message;
  void toast.update().catch((error: unknown) => {
    console.debug("Operation result could not be displayed", error);
  });

  void sendDesktopNotification({
    title: feedback.title,
    body: feedback.message,
    urgency: feedback.status === "success" ? "Normal" : "High",
  }).catch((error: unknown) => {
    console.debug("Desktop notification could not be delivered", error);
  });
}

export function updateOperationToast(
  toast: Toast,
  status: SoftwareOperationStatus,
): void {
  const message = status.message;
  if (toast.message === message) return;
  toast.message = message;
  void toast.update().catch((error: unknown) => {
    console.debug("Operation status could not be displayed", error);
  });
}
