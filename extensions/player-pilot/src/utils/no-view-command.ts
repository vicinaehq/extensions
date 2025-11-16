import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { executePlaybackAction, type PlayerCtlPlaybackAction } from "./playerctl";
import { getPreferredPlayerNames } from "./preferences";

/**
 * Shared logic for all the no-view commands
 */
export default async function executeNoViewCommand(playerCtlAction: PlayerCtlPlaybackAction) {
  try {
    const preferredPlayerNames = getPreferredPlayerNames();
    if (preferredPlayerNames === undefined) {
      await executePlaybackAction(playerCtlAction);
    } else {
      await Promise.all(
        preferredPlayerNames.map((playerName) => {
          executePlaybackAction(playerCtlAction, playerName);
        }),
      );
    }
  } catch {
    await showToast(Toast.Style.Failure, "playerctl command error");
    return;
  }

  await closeMainWindow();
}
