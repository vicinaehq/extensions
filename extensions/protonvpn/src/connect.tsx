import { showToast, Toast } from "@vicinae/api";
import { checkProtonVPNInstalled, connectVPN, getVPNStatus, CONNECT_DELAY } from "./utils";

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

    // Check if already connected
    const status = await getVPNStatus();
    if (status.isConnected) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Already Connected",
        message: `Currently connected to ${status.server || "ProtonVPN"}`
      });
      return;
    }

    await showToast({
      style: Toast.Style.Animated,
      title: "Connecting to ProtonVPN...",
      message: "Finding fastest server"
    });

    await connectVPN();

    // Wait for handshake
    await new Promise((r) => setTimeout(r, CONNECT_DELAY));

    // Verify connection
    const newStatus = await getVPNStatus();
    if (newStatus.isConnected) {
      await showToast({
        style: Toast.Style.Success,
        title: "Connected Successfully",
        message: newStatus.server || "ProtonVPN connection established"
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "Connection Failed",
        message: "Unable to establish VPN connection"
      });
    }
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Connection Failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
