import { executeIwctlCommandSilent } from "./execute-iwctl";
import { showToast } from "@vicinae/api";

export interface WifiNetwork {
  inUse: boolean;
  ssid: string;
  signal: number;
  security: string;
  bssid: string;
}

export interface SavedNetwork {
  name: string;
  security: string;
  hidden: string;
  last_used: string;
}

export interface WifiDevice {
  name: string;
  address:string
  powered: string;
  adapter: string;
  mode: string;
}

export interface CurrentConnection {
  name: string;
  device: string;
}



/**
 * Get the name of the Wi-Fi device from iwctl
 */
export async function getDevice(): Promise<WifiDevice | null> {
  const devicesResult = await executeIwctlCommandSilent("device list");

  if (!devicesResult.success) {
    throw new Error(devicesResult.error || "Coulnt retrieve device list from command");
  }

  const lines = devicesResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Make sure there are enough lines
  if (lines.length > 3) {
    const parts = lines[4].split(/\s+/);

    if (parts.length > 5) {
      return {
        name: parts[1] || "",
        address:parts[2] || "",
        powered: parts[3] || "",
        adapter: parts[4] || "",
        mode: parts[5] || "",
      };
    }
  }

  return null;
}

/**
 * Parse iwctl connection show output into structured data
 */
export function parseSavedConnections(output: string): SavedNetwork[] {
  const lines = output
  .split("\n")
  .slice(4)
  .filter(line => line.trim());

  const regex = /\b(?!.*0m)[\w,:]+(?: {1,2}(?!.*0m)[\w,:]+)*\b/g;

  if (lines.length === 0) return [];


  lines[0] = lines[0].slice(4);

  return lines
    .map((line) => {
      const parts = line.match(regex);
      if (!parts) return null;

      if (parts.length === 3) {
        return {
          name: parts[0],
          security: parts[1],
          last_used: parts[2],
        };
      }

      return {
        name: parts[0],
        security: parts[1],
        hidden: parts[2],
        last_used: parts[3],
      };
    })
    .filter(Boolean) as SavedNetwork[];
}

/**
 * Load saved networks from iwctl
 */
export async function loadSavedNetworks(): Promise<SavedNetwork[]> {
  try {
    const result = await executeIwctlCommandSilent("known-networks list");
    if (result.success) {
      return parseSavedConnections(result.stdout);
    }
  } catch (error) {
    console.error("Failed to load saved networks:", error);
  }
  return [];
}

/**
 * Load Wi-Fi device info from iwctl
 */
export async function loadWifiDevice(): Promise<WifiDevice | null> {
  try {
    const device = await getDevice();
    if (!device) {
      throw new Error("No Device found")
    }
    return device

  } catch (error) {
    console.error("Failed to load Wi-Fi device:", error);
  }
  return null;
}

/**
 * Parse iwctl device wifi list output into structured data
 */
export async function parseWifiList(
  output: string,
  deviceName: string
): Promise<WifiNetwork[]> {
  const lines = output
    .split("\n")
    .slice(4)
    .filter((line) => line.trim());

  if (lines.length === 0) {
    return [];
  }

  const networks = await Promise.all(
    lines.map(async (line) => {
      const stripAnsi = line.replace(/\x1b\[[0-9;]*m/g, "");
      const startsWithGreaterThan = stripAnsi.trim().startsWith(">");
      const cleanLine = startsWithGreaterThan
        ? stripAnsi.trim().substring(1).trim()
        : stripAnsi.trim();

      const parts = cleanLine.split(/\s{2,}/);

      if (parts.length < 2) return null;

      const ssid = parts[0] || "";
      const security = parts[1] || "";
      const signal = parseInt(parts[2] || "-10000", 10) / 100;

      // Fetch BSSID asynchronously
      const bssidArray = await getBssid(ssid, deviceName);
      const bssid = bssidArray || "unknown";

      return {
        inUse: startsWithGreaterThan,
        bssid,
        ssid,
        signal,
        security,
      };
    })
  );

  // Filter out nulls after all promises resolved
  return networks.filter(Boolean) as WifiNetwork[];
}



/**
 * Get the BSSID for each network
 */
export async function getBssid(
  ssid: string,
  deviceName: string
): Promise<string> {

  const result = await executeIwctlCommandSilent(
    "station",
    [deviceName, "get-bsses", `"${ssid}"`]
  );

  if(!result.success) {
    throw new Error(result.error || "Coulnt retrieve BSSID from command");
  }

  return result.stdout
    .split("\n")
    .slice(5)
    .filter((line) => line.trim())[0].split(/\s{2,}/)[2];
}