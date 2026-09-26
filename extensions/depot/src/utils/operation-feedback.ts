import { Toast } from "@vicinae/api";
import { runProcess } from "./process.ts";

const NOTIFY_SEND = "/usr/bin/notify-send";

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

  void sendDesktopNotification(feedback);
}

async function sendDesktopNotification(
  feedback: OperationFeedback,
): Promise<void> {
  try {
    await runProcess(
      NOTIFY_SEND,
      [
        "--app-name=Depot",
        `--urgency=${feedback.status === "success" ? "normal" : "critical"}`,
        feedback.title,
        feedback.message,
      ],
      {
        captureStdout: false,
        maxOutputBytes: 64 * 1024,
        timeoutMs: 5_000,
      },
    );
  } catch (error) {
    console.debug("Desktop notification could not be delivered", error);
  }
}
