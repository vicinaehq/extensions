import { getPreferenceValues } from "@vicinae/api";
import RestartWifiNmcli from "./nmcli/restart-wifi";
import RestartWifiIwclt from "./iwctl/restart-wifi";

export default async function ToggleWifiOn() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();
  
  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      await RestartWifiNmcli()
      break;

    case "iwctl": {
      await RestartWifiIwclt()
      break;
    }
    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }
  
}
