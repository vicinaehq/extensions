import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getPreferenceValues } from "@vicinae/api";

const execAsync = promisify(exec);

export type PlayerMetadata = {
  player?: string;
  title?: string;
  album?: string;
  artist?: string;
  albumArt?: string;
  songLength?: string;
  position?: string;
  paused?: boolean;
};

export type PlayerInfo = {
  name: string;
  displayName: string;
  status: "Playing" | "Paused" | "Stopped";
  metadata: PlayerMetadata | null;
};

export async function getPlayerMetadata(player: string): Promise<PlayerMetadata | null> {
  try {
    const metadataRaw = await execAsync(`playerctl --player ${player} metadata`);

    const metadata = metadataRaw.stdout
      .split("\n")
      .map((u) => u.split(" ").filter((v) => v.length >= 1));

    const info: PlayerMetadata = {};

    info.player = metadata[0][0];

    for (const line of metadata) {
      if (line[1] === "xesam:title") {
        info.title = line.slice(2).join(" ");
      } else if (line[1] === "xesam:album") {
        info.album = line.slice(2).join(" ");
      } else if (line[1] === "xesam:artist") {
        info.artist = line.slice(2).join(" ");
      } else if (line[1] === "mpris:artUrl") {
        info.albumArt = line.slice(2).join(" ");
      } else if (line[1] === "mpris:length") {
        const us = parseInt(line[2], 10);
        const mins = Math.floor(us / 60000000);
        const remainingUs = us % 60000000;
        const secs = Math.floor(remainingUs / 1000000);
        info.songLength = `${mins}:${String(secs).padStart(2, "0")}`;
      }
    }

    const positionRaw = await execAsync(`playerctl --player ${player} position`);
    const position = Math.floor(parseFloat(positionRaw.stdout));
    const mins = Math.floor(position / 60);
    const secs = position % 60;

    info.position = `${mins}:${String(secs).padStart(2, "0")}`;

    const status = await execAsync(`playerctl --player ${player} status`);

    info.paused = status.stdout !== "Playing";

    return info;
  } catch (error) {
    if (error instanceof Error && error.message.includes("No players found")) {
      console.warn("No media players found. Make sure a media player is running.");
      return null;
    }
    throw error;
  }
}

function getDisplayName(playerName: string): string {
  let displayName = ""

  const splittedName = playerName.split(".")

  if (splittedName.length === 3) {
    displayName = splittedName[1]
  } else {
    displayName = splittedName[0]
  }

  return displayName.charAt(0)
    .toUpperCase() + displayName.slice(1).toLowerCase();

}

export async function getAllPlayers(): Promise<PlayerInfo[]> {
  try {
    // Get preference for which players to control
    const preferences = getPreferenceValues();
    const preferredPlayers = preferences["playerctl-players"] as string;

    // Get list of all players
    const playersRaw = await execAsync("playerctl --list-all");
    const allPlayerNames = playersRaw.stdout
      .trim()
      .split("\n")
      .filter((name) => name.length > 0);

    if (allPlayerNames.length === 0) {
      return [];
    }

    // Filter players based on preference
    let playerNames: string[];
    if (preferredPlayers === "%any") {
      // Show all players
      playerNames = allPlayerNames;
    } else {
      // Filter by preferred players
      const preferredList = preferredPlayers.split(",").map((p) => p.trim());
      playerNames = allPlayerNames.filter((name) => {
        // Check if player name matches any preferred player (supports partial matching)
        return preferredList.some(
          (preferred) =>
            name.toLowerCase().includes(preferred.toLowerCase()) ||
            preferred.toLowerCase().includes(name.toLowerCase())
        );
      });
    }

    if (playerNames.length === 0) {
      console.warn(`No players found matching preference: ${preferredPlayers}`);
      return [];
    }

    const players: PlayerInfo[] = [];

    for (const playerName of playerNames) {
      try {
        // Get player status
        const statusRaw = await execAsync(`playerctl --player ${playerName} status`);
        const status = statusRaw.stdout.trim() as "Playing" | "Paused" | "Stopped";

        // Create display name: capitalize first letter and take first part before dots
        const displayName = getDisplayName(playerName)

        // Get metadata if player is playing or paused
        let metadata: PlayerMetadata | null = null;
        if (status === "Playing" || status === "Paused") {
          metadata = await getPlayerMetadata(playerName);
        }

        players.push({
          name: playerName,
          displayName,
          status,
          metadata,
        });
      } catch (error) {
        // Skip players that can't be accessed
        console.warn(`Failed to get info for player ${playerName}:`, error);
      }
    }

    // Sort players: playing first, then paused, then stopped
    return players.sort((a, b) => {
      const statusOrder = { Playing: 0, Paused: 1, Stopped: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("No players found")) {
      console.warn("No media players found. Make sure a media player is running.");
      return [];
    }
    throw error;
  }
}
