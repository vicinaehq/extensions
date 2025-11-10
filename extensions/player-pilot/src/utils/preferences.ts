import { getPreferenceValues } from "@vicinae/api";

/**
 * Retrieves the list of preferred player names from user preferences.
 *
 * @returns An array of player names if specific players are configured,
 *          or `undefined` if the preference is set to "%any" or is empty.
 */
export function getPreferredPlayerNames(): string[] | undefined {
  const preferences = getPreferenceValues();
  const preferredPlayers = preferences["playerctl-players"] as string;

  if (preferredPlayers === "%any" || preferredPlayers.trim() === "") {
    return undefined;
  }

  return preferredPlayers.split(",").map((playerName) => playerName.trim());
}
