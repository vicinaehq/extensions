import { showHUD } from "@vicinae/api";
import { disconnect, errorText } from "./lib";

export default async function Command() {
  await showHUD(await disconnect().then(() => "NordVPN disconnected", (e) => `NordVPN failed: ${errorText(e)}`));
}
