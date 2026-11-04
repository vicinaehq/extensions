import { showHUD } from "@vicinae/api";
import { connect, errorText } from "./lib";

export default async function Command() {
  await showHUD("Connecting to NordVPN…");
  await showHUD(await connect().then((s) => `NordVPN: connected to ${s}`, (e) => `NordVPN failed: ${errorText(e)}`));
}
