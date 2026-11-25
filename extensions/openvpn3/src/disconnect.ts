import { showToast, Toast } from "@vicinae/api";
import { disconnectProfile } from "./openvpn";
import { getProfile } from "./settings";

export default async function Disconnect() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Disconnecting VPN…",
  });

  try {
    const profile = await getProfile();
    if (!profile) throw new Error("Run Configure first to set your VPN profile.");
    const result = await disconnectProfile(profile);
    if (result === "pending") {
      toast.style = Toast.Style.Failure;
      toast.title = "VPN disconnect not yet confirmed";
      toast.message = "Check Show Status to see whether the session has ended.";
      return;
    }
    toast.style = Toast.Style.Success;
    toast.title = result === "disconnected" ? "VPN disconnected" : "VPN already disconnected";
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Could not confirm VPN disconnect";
    toast.message = (error as Error).message;
  }
}
