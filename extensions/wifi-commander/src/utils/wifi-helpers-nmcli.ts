import { executeNmcliCommandSilent } from "./execute-nmcli";

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
  uuid: string;
  type: string;
  device: string;
  state: string;
}

export interface WifiDevice {
  name: string;
  type: string;
  state: string;
  connection: string;
}

export interface CurrentConnection {
  name: string;
  device: string;
}

/**
 * Parse nmcli device wifi list output into structured data
 */
export function parseWifiList(output: string): WifiNetwork[] {
  const lines = output.split("\n").filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  return lines
    .slice(1)
    .map((line) => {
      // Check if the line starts with * (connected network)
      const startsWithAsterisk = line.trim().startsWith("*");
      const cleanLine = startsWithAsterisk ? line.trim().substring(1).trim() : line.trim();

      // Split by multiple spaces to handle the fixed-width format
      const parts = cleanLine.split(/\s{2,}/);

      if (parts.length < 8) return null;

      // Extract fields based on their known positions
      // Format: BSSID SSID MODE CHAN RATE SIGNAL BARS SECURITY
      const bssid = parts[0] || "";
      const ssid = parts[1] || "";
      const mode = parts[2] || "";
      const channel = parseInt(parts[3] || "0", 10);
      const rate = parts[4] || "";
      const signal = parseInt(parts[5] || "0", 10);
      const bars = parts[6] || "";
      const security = parts[7] || "";

      return {
        inUse: startsWithAsterisk,
        bssid,
        ssid,
        mode,
        channel,
        rate,
        signal,
        bars,
        security,
      };
    })
    .filter(Boolean) as WifiNetwork[];
}

/**
 * Parse nmcli connection show output into structured data
 */
export function parseSavedConnections(output: string): SavedNetwork[] {
  const lines = output.split("\n").filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  return lines
    .slice(1)
    .map((line) => {
      const parts = line.split(/\s{2,}/);
      if (parts.length < 4) return null;

      return {
        name: parts[0] || "",
        uuid: parts[1] || "",
        type: parts[2] || "",
        device: parts[3] || "",
        state: parts[4] || "",
      };
    })
    .filter(Boolean) as SavedNetwork[];
}

/**
 * Parse nmcli device status output to find Wi-Fi device
 */
export function parseWifiDevice(output: string): WifiDevice | null {
  const lines = output.split("\n").filter((line) => line.trim());
  const wifiDeviceLine = lines.find((line) => line.includes("wifi"));

  if (wifiDeviceLine) {
    const parts = wifiDeviceLine.split(/\s{2,}/);
    if (parts.length >= 4) {
      return {
        name: parts[0] || "",
        type: parts[1] || "",
        state: parts[2] || "",
        connection: parts[3] || "",
      };
    }
  }

  return null;
}

/**
 * Parse nmcli connection show --active output to get current connection
 */
export function parseCurrentConnection(output: string): CurrentConnection | null {
  const lines = output.split("\n").filter((line) => line.trim());

  if (lines.length > 1) {
    const firstLine = lines[1];
    const parts = firstLine.split(/\s{2,}/);
    if (parts.length >= 4) {
      return {
        name: parts[0] || "",
        device: parts[3] || "",
      };
    }
  }

  return null;
}

/**
 * Sort networks to show connected one first
 */
export function sortNetworks(networks: WifiNetwork[]): WifiNetwork[] {
  return networks.sort((a, b) => {
    if (a.inUse && !b.inUse) return -1;
    if (!a.inUse && b.inUse) return 1;
    return 0;
  });
}

/**
 * Load saved networks from nmcli
 */
export async function loadSavedNetworks(): Promise<SavedNetwork[]> {
  try {
    const result = await executeNmcliCommandSilent("connection show");
    if (result.success) {
      return parseSavedConnections(result.stdout);
    }
  } catch (error) {
    console.error("Failed to load saved networks:", error);
  }
  return [];
}

/**
 * Load Wi-Fi device info from nmcli
 */
export async function loadWifiDevice(): Promise<WifiDevice | null> {
  try {
    const result = await executeNmcliCommandSilent("device status");
    if (result.success) {
      return parseWifiDevice(result.stdout);
    }
  } catch (error) {
    console.error("Failed to load Wi-Fi device:", error);
  }
  return null;
}

/**
 * Load current connection from nmcli
 */
export async function loadCurrentConnection(): Promise<CurrentConnection | null> {
  try {
    const result = await executeNmcliCommandSilent("connection show --active");
    if (result.success) {
      return parseCurrentConnection(result.stdout);
    }
  } catch (error) {
    console.error("Failed to load current connection:", error);
  }
  return null;
}

