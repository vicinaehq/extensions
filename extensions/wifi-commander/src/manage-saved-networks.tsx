import { getPreferenceValues } from "@vicinae/api";
import ManageSavedNetworksNmcli from "./nmcli/manage-saved-networks";
import  ManageSavedNetworksIwctl from "./iwctl/manage-saved-networks";

export default function manageSavedNetworks() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();
  
  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      return ManageSavedNetworksNmcli()
      break;

    case "iwctl": {
      return ManageSavedNetworksIwctl()
      break;
    }
    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }
  
}
