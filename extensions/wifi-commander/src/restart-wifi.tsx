import { getPreferenceValues, showToast } from "@vicinae/api";
import { executeNmcliCommand, executeIwctlCommand, type ExecResult } from "./utils/execute";
import { getIwctlDevice } from "./utils/wifi-helpers";

export default async function RestartWifi() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();
  let onResult: ExecResult;

  await showToast({
    title: "Restarting Wi-Fi",
    message: "Please wait while Wi-Fi services restart...",
  });



  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      // Turn off Wi-Fi
      const offResult = await executeNmcliCommand("radio wifi off");

      if (!offResult.success) {
        await showToast({
          title: "Failed to Restart Wi-Fi",
          message: offResult.error || "Could not turn off Wi-Fi",
        });
        return;
      }

      // Small delay to ensure clean shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Turn on Wi-Fi
      onResult = await executeNmcliCommand("radio wifi on");
      break;

    case "iwctl": {
      const deviceName = await getIwctlDevice()
      if (!deviceName.success){
        onResult = deviceName;
        break;
      }

      // Turn off Wi-Fi
      const offResult = await executeIwctlCommand("device", [deviceName["stdout"], "set-property", "Powered", "off"]);

      if (!offResult.success) {
        await showToast({
          title: "Failed to Restart Wi-Fi",
          message: offResult.error || "Could not turn off Wi-Fi",
        });
        return;
      }

      // Small delay to ensure clean shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

    // Turn on Wi-Fi
      onResult = await executeIwctlCommand("device", [deviceName["stdout"], "set-property", "Powered", "on"]);
      break;
    }
    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }

  if (onResult.success) {
    await showToast({
      title: "Wi-Fi Restarted",
      message: "Wi-Fi services have been restarted successfully",
    });
  } else {
    await showToast({
      title: "Failed to Restart Wi-Fi",
      message: onResult.error || "Could not turn on Wi-Fi",
    });
  }
}
