import { showToast } from "@vicinae/api";
import { executeIwctlCommand} from "../utils/execute-iwctl";
import { getDevice } from "../utils/wifi-helpers-iwctl";

export default async function ToggleWifiOnIwctl() {
    const deviceName = await getDevice()
    if (!deviceName){
        throw new Error("Could not find network device name")
    }

    const result = await executeIwctlCommand("device", [deviceName.name, "set-property", "Powered", "on"]);

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
