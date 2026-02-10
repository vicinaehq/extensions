import { showToast, Toast } from "@vicinae/api";
import { checkProtonVPNInstalled, disconnectVPN, getVPNStatus, DISCONNECT_DELAY } from "./utils";

export default async function Command() {
  try {
    if (!(await checkProtonVPNInstalled())) {
      await showToast({
        style: Toast.Style.Failure,
        title: "ProtonVPN Not Installed",
        message: "Please install ProtonVPN CLI first"
      });
      return;
    }

    // Check if actually connected
    const status = await getVPNStatus();
    if (!status.isConnected) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Not Connected",
        message: "ProtonVPN is already disconnected"
      });
      return;
    }

    await showToast({
      style: Toast.Style.Animated,
      title: "Disconnecting from ProtonVPN...",
      message: `Closing connection to ${status.server || "server"}`
    });

    await disconnectVPN();

    // Wait for interface to drop
    await new Promise((r) => setTimeout(r, DISCONNECT_DELAY));

    // Verify disconnection
    const newStatus = await getVPNStatus();
    if (!newStatus.isConnected) {
      await showToast({
        style: Toast.Style.Success,
        title: "Disconnected Successfully",
        message: "ProtonVPN connection closed"
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "Disconnection Failed",
        message: "Unable to close VPN connection"
      });
    }
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Disconnection Failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
