import { showToast, Toast, closeMainWindow } from "@vicinae/api";
import {
  checkProtonVPNInstalled,
  getVPNStatus,
  connectVPN,
  disconnectVPN,
  CONNECT_DELAY,
  DISCONNECT_DELAY,
} from "./utils";

export default async function Command() {
  try {
    const installed = await checkProtonVPNInstalled();
    if (!installed) {
      await showToast({
        style: Toast.Style.Failure,
        title: "ProtonVPN not installed",
        message: "Could not find 'protonvpn' or 'protonvpn-cli' in your path.",
      });
      return;
    }

    const status = await getVPNStatus();

    if (status.isConnected) {
      await showToast({ style: Toast.Style.Animated, title: "Disconnecting..." });
      await disconnectVPN();

      // Wait for interface to drop
      await new Promise((r) => setTimeout(r, DISCONNECT_DELAY));

      await showToast({
        style: Toast.Style.Success,
        title: "Disconnected",
        message: "ProtonVPN has been disconnected"
      });
    } else {
      await showToast({ style: Toast.Style.Animated, title: "Connecting..." });
      await connectVPN();

      // Wait for WireGuard handshake
      await new Promise((r) => setTimeout(r, CONNECT_DELAY));

      // Verify connection succeeded
      const newStatus = await getVPNStatus();
      if (newStatus.isConnected) {
        await showToast({
          style: Toast.Style.Success,
          title: "Connected",
          message: `Connected to ${newStatus.server || "ProtonVPN"}`
        });
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Connection Failed",
          message: "Please check ProtonVPN CLI status"
        });
      }
    }

    // Close the window after action completes
    await closeMainWindow();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
