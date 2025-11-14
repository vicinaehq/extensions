import { showToast } from "@vicinae/api";
import { executeIwctlCommand} from "../utils/execute";
import { getIwctlDevice } from "../utils/wifi-helpers";

export default async function ToggleWifiOnIwctl() {
    const deviceName = await getIwctlDevice()
    if (!deviceName.success){
        await showToast({
            "title": "Failed to find Device",
            "message": deviceName.error || "Could not find Device"
        });
        return
      }

    const result = await executeIwctlCommand("device", [deviceName["stdout"], "set-property", "Powered", "off"]);
      
    if (result.success) {
        await showToast({
        title: "Wi-Fi Disbled",
        message: "Wi-Fi has been turned off successfully",
    });
    } else {
        await showToast({
        title: "Failed to Disabled Wi-Fi",
        message: result.error || "Could not turn off Wi-Fi",
    });
    }
}