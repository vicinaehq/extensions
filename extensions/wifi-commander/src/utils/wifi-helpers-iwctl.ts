import { executeIwctlCommandSilent } from "./execute-iwctl";

export interface WifiNetwork {
  inUse: boolean;
  ssid: string;
  bssid: string;
  mode: string;
  channel: number;
  rate: string;
  signal: number;
  bars: string;
  security: string;
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


  lines[0] = lines[0].slice(3);

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
// TODO:
export function parseWifiList(output: string): WifiNetwork[] | null{
  return null

}

/**
 * Sort networks to show connected one first
 */
// TODO:
export function sortNetworks(networks: WifiNetwork[]): WifiNetwork[] | null{
  return null
}