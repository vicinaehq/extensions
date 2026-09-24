import { execFile } from "child_process";
import * as path from "path";
import { environment, showToast, Toast } from "@vicinae/api";

export function runNativeAction(action: "rotate" | "left" | "right" | "fullscreen") {
  const binaryPath = path.join(environment.assetsPath, "window-manager");
  execFile(binaryPath, [action], (error, stdout, stderr) => {
    if (error) {
      console.error(`Error:: ${stderr || error.message}`);

      showToast({
        style: Toast.Style.Failure,
        title: "Need Accessibility Permissions",
        message: "Go to System Settings -> Privacy -> Accessibility"
      });
    }
  });
}
