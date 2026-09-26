import {
  LaunchType,
  Toast,
  environment,
  launchCommand,
  sendDesktopNotification,
} from "@vicinae/api";

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

  void sendDesktopNotification({
    title: feedback.title,
    body: feedback.message,
    urgency: feedback.status === "success" ? "Normal" : "High",
  }).catch((error: unknown) => {
    console.debug("Desktop notification could not be delivered", error);
  });
}

export async function reopenDepotCommand(
  context?: Record<string, string>,
): Promise<void> {
  try {
    await launchCommand({
      name: environment.commandName,
      type: LaunchType.UserInitiated,
      context,
    });
  } catch (error) {
    console.debug("Depot command could not be reopened", error);
  }
}
