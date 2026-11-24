import { showToast, Toast } from "@vicinae/api";
import { disconnectProfile } from "./openvpn";
import { getProfile } from "./settings";

export default async function Disconnect() {
  try {
    const profile = await getProfile();
    if (!profile) throw new Error("Run Configure first to set your VPN profile.");
    const requested = await disconnectProfile(profile);
    await showToast({
      style: Toast.Style.Success,
      title: requested ? "VPN disconnect requested" : "VPN already disconnected",
    });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not disconnect",
      message: (error as Error).message,
    });
  }
}
