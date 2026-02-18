import { LocalStorage } from "@vicinae/api";

/**
 * Utility class to manage inactivity timer for KeePassXC database.
 */
class InactivityTimer {
  /**
   * Launch the inactivity timer.
   * Sets the current time as the last activity time.
   */
  static launchInactivityTimer = (): void => {
    const now = Date.now();
    LocalStorage.setItem("lastActivity", now.toString());
  };

  /**
   * Check if there has been recent activity within the specified lock time.
   * @param lockAfterInactivity - Time in minutes after which to lock.
   * @returns Promise<boolean> - True if there has been recent activity, false otherwise.
   */
  static hasRecentActivity = (lockAfterInactivity: number): Promise<boolean> => {
    return LocalStorage.getItem("lastActivity").then((lastActivity) => {
      if (lastActivity == undefined) {
        return false;
      }
      const lastActivityTime = parseInt(lastActivity as string);
      const currentTime = Date.now();
      const timeDiff = (currentTime - lastActivityTime) / (1000 * 60); // in minutes
      return timeDiff < lockAfterInactivity;
    });
  };
}

export { InactivityTimer };