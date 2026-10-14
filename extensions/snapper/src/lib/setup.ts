import { showHUD } from "@vicinae/api";
import { setupAccess } from "./snapper";

/**
 * Run the one-time pkexec access setup. Confirmation is shown via showHUD, which
 * survives the launcher window closing when the polkit password dialog steals focus
 * (a plain in-window Toast would be lost in that case). Returns success.
 */
export async function runSetup(): Promise<boolean> {
  try {
    await setupAccess();
    await showHUD("✓ Snapper access granted — reopen to browse snapshots");
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await showHUD(`✗ Snapper setup failed — ${msg}`);
    return false;
  }
}
