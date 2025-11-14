import { getPreferenceValues } from "@vicinae/api";
import ToggleWifiOnNmcli from "./nmcli/toggle-wifi-on";
import ToggleWifiOnIwctl from "./iwctl/toggle-wifi-on";

export default async function ToggleWifiOn() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();
  
  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      await ToggleWifiOnNmcli()
      break;

    case "iwctl": {
      await ToggleWifiOnIwctl()
      break;
    }
    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }
  
}
