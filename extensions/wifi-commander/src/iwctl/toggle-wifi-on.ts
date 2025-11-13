import { getPreferenceValues, showToast } from "@vicinae/api";
import { executeNmcliCommand, executeIwctlCommand, type ExecResult } from "../utils/execute";
import { getIwctlDevice } from "../utils/wifi-helpers";

export default async function ToggleWifiOnIwctl() {
    const adapterName = await getIwctlDevice()
    if (!adapterName.success){
        await showToast({
            "title": "Failed to find Device",
            "message": adapterName.error || "Could not find Device"
        });
        return
      }

    const result = await executeIwctlCommand("device", [adapterName["stdout"], "set-property", "Powered", "on"]);
      
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
