import { getPreferenceValues, showToast } from "@vicinae/api";
import { executeNmcliCommand, executeIwctlCommand, type ExecResult } from "./utils/execute";
import { getIwctlDevice } from "./utils/wifi-helpers";

export default async function ToggleWifiOff() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();
  let result: ExecResult;

  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      result = await executeNmcliCommand("radio wifi on");
      break;

    case "iwctl": {
      const adapterName = await getIwctlDevice()
      if (!adapterName.success){
        result = adapterName;
        break;
      }

      result = await executeIwctlCommand("device", [adapterName["stdout"], "set-property", "Powered", "on"]);
      break;
    }
    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }
  if (result.success) {
    await showToast({
      title: "Wi-Fi Enabled",
      message: "Wi-Fi has been turned on successfully",
    });
  } else {
    await showToast({
      title: "Failed to Enabled Wi-Fi",
      message: result.error || "Could not turn on Wi-Fi",
    });
  }
}
