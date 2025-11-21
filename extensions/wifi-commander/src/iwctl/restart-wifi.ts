import { showToast } from "@vicinae/api";
import { executeIwctlCommand } from "../utils/execute-iwctl";
import { getDevice } from "../utils/wifi-helpers-iwctl";

export default async function RestartWifiIwctl() {
  await showToast({
    title: "Restarting Wi-Fi",
    message: "Please wait while Wi-Fi services restart...",
  });

     const deviceName = await getDevice()
     if (!deviceName){
      throw new Error("Could not find network device name")
      }

      // Turn off Wi-Fi
      const offResult = await executeIwctlCommand("device", [deviceName.name, "set-property", "Powered", "off"]);

      if (!offResult.success) {
        await showToast({
          title: "Failed to Restart Wi-Fi",
          message: offResult.error || "Could not turn off Wi-Fi",
        });
        return;
      }

      // Small delay to ensure clean shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

    // Turn on Wi-Fi
      const onResult = await executeIwctlCommand("device", [deviceName.name, "set-property", "Powered", "on"]);

  if (onResult.success) {
    await showToast({
      title: "Wi-Fi Restarted",
      message: "Wi-Fi services have been restarted successfully",
    });
  } else {
    await showToast({
      title: "Failed to Restart Wi-Fi",
      message: onResult.error || "Could not turn on Wi-Fi",
    });
  }
}
