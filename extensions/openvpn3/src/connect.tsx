import { showToast, Toast } from "@vicinae/api";
import { connectProfile, validateProfile } from "./openvpn";
import { getProfile } from "./settings";

export default async function Connect() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Connecting to OpenVPN",
    message: "Complete browser authentication if prompted.",
  });

  try {
    const profile = await getProfile();
    if (!profile) throw new Error("Run Configure first to set your VPN profile.");

    const result = await connectProfile(await validateProfile(profile));
    toast.style = Toast.Style.Success;
    toast.message = undefined;
    switch (result) {
      case "connected":
        toast.title = "VPN connected";
        break;
      case "already-connected":
        toast.title = "VPN already connected";
        break;
      case "already-active":
        toast.title = "VPN session already exists";
        toast.message = "Use Show Status to check its state.";
        break;
      case "pending":
        toast.title = "VPN connection not yet confirmed";
        toast.message = "Finish browser authentication and check Show Status.";
        break;
    }
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Could not connect";
    toast.message = (error as Error).message;
  }
}
