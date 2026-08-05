import { showHUD, showToast, Toast } from "@vicinae/api";
import { execFile } from "node:child_process";

/**
 * No-view command: selecting it and pressing Enter starts a backup immediately —
 * no intermediate view to click through. Confirmation via HUD so it shows even after
 * the launcher window closes.
 */
export default async function BackUpNow() {
  await new Promise<void>((resolve) => {
    execFile("deja-dup", ["--backup"], async (err) => {
      if (err) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not start backup",
          message: err.message,
        });
      } else {
        await showHUD("Backup started in Déjà Dup");
      }
      resolve();
    });
  });
}
