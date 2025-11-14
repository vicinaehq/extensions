import { showToast } from "@vicinae/api";
import { executeNmcliCommand, executeIwctlCommand, type ExecResult } from "../utils/execute-nmcli";

export default async function ToggleWifiOff() {
    const result = await executeNmcliCommand("radio wifi off");

    if (result.success) {
        await showToast({
            title: "Wi-Fi Disabled",
            message: "Wi-Fi has been turned off successfully",
        });
    } else {
        await showToast({
            title: "Failed to Disable Wi-Fi",
            message: result.error || "Could not turn off Wi-Fi",
        });
    }
}

