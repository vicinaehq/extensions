import { getPreferenceValues, LocalStorage } from "@raycast/api";

interface Preference {
  lockAfterInactivity: string;
}

const preferences: Preference = getPreferenceValues();
// Minute(s) before locking the database
const lockAfterInactivity = Number(preferences.lockAfterInactivity);

class InactivityTimer {
  /**
   * Checks whether the user has performed an activity recently.
   *
   * @returns {Promise<boolean>} Whether the user has performed an activity in the last lockAfterInactivity minutes.
   */
  static hasRecentActivity = async (): Promise<boolean> => {
    const lastActivity = await LocalStorage.getItem("lastActivity");

    if (lastActivity) {
      return ((Date.now() - Number(lastActivity)) / 60000) <= lockAfterInactivity;
    }

    return false;
  };

  /**
   * Starts an interval that updates the lastActivity value in LocalStorage every 5 seconds.
   *
   * This is used to detect user inactivity and lock the database after the specified lockAfterInactivity time.
   */
  static launchInactivityTimer = (): void => {
    setInterval(() => {
      LocalStorage.setItem("lastActivity", Date.now());
    }, 5000);
  };
}

export { InactivityTimer };
