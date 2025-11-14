import { showToast } from "@vicinae/api";
import { executeNmcliCommand } from "../utils/execute-nmcli";

export default async function RestartWifiNmcli() {

  await showToast({
    title: "Restarting Wi-Fi",
    message: "Please wait while Wi-Fi services restart...",
  });


      // Turn off Wi-Fi
      const offResult = await executeNmcliCommand("radio wifi off");

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
      const onResult = await executeNmcliCommand("radio wifi on");


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
