import { getPreferenceValues, showToast } from "@vicinae/api";
import { executeNmcliCommand, executeIwctlCommand, executeIwctlCommandSilent, type ExecResult } from "./utils/execute";

export default async function ToggleWifiOn() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();
  let result: ExecResult;

  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      result = await executeNmcliCommand("radio wifi on");
      break;

    case "iwctl": {
      const adaptersResult = await executeIwctlCommand("adapter list");


      const lines = adaptersResult.stdout.split("\n").filter((line) => line.trim());
      let adapterName = "";

      for (const line of lines) {
        const match = line.match(/^\s*(\w+)\s+/);
        if (match && match[1] && match[1] !== "Adapter") {
          adapterName = match[1];
          break;
        }
      }

      if (!adapterName) {
        result = {
          success: false,
          stdout: "",
          stderr: "No Wi-Fi adapter found",
          error: "No Wi-Fi adapter found",
        };
        break;
      }

      result = await executeIwctlCommand("adapter", [adapterName, "set-property", "Powered", "on"]);
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
      title: "Failed to Enable Wi-Fi",
      message: result.error || "Could not turn on Wi-Fi",
    });
  }
}
