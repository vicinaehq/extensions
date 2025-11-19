import { getPreferenceValues } from "@vicinae/api";
import ScanWifiNmcli from "./nmcli/scan-wifi";
import ScanWifiIwclt from "./iwctl/scan-wifi";

export default function scanWifi() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();
  
  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      return ScanWifiNmcli()
      break;

    case "iwctl": {
      return ScanWifiIwclt()
      break;
    }
    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }
  
}
