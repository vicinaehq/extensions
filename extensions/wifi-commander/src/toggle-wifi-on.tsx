import { showToast } from "@vicinae/api";
import { executeNmcliCommand } from "./utils/execute";

export default async function ToggleWifiOn() {
  const result = await executeNmcliCommand("radio wifi on");

  if (result.success) {
    await showToast({
      title: "Wi-Fi Enabled",
      message: "Wi-Fi has been turned on successfully",
    });
  } else {
    await showToast({
      title: "Failed to Enable Wi-Fi",
      message: result.error || "Could not turn on Wi-Fi",
    });
  }
}
