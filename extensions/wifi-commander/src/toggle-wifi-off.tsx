import { getPreferenceValues } from "@vicinae/api";
import ToggleWifiOffNmcli from "./nmcli/toggle-wifi-off";
import ToggleWifiOffIwctl from "./iwctl/toggle-wifi-off";

export default async function ToggleWifiOn() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();
  
  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      await ToggleWifiOffNmcli()
      break;

    case "iwctl": {
      await ToggleWifiOffIwctl()
      break;
    }
    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }
  
}

