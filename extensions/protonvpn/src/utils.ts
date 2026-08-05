import { exec as apiExec, MenuBarExtra } from "@vicinae/api";
import { promisify } from "util";
import { exec as nodeExec } from "child_process";
import { existsSync } from "fs";

// We must use Node's native exec, promisified for async/await
const exec = promisify(nodeExec);

// Constants for delays
export const DISCONNECT_DELAY = 500; // ms to wait for interface to drop
export const CONNECT_DELAY = 1500; // ms to wait for WireGuard handshake
export const RECONNECT_DELAY = 500; // ms between disconnect and reconnect

// Network timeouts
const CURL_TIMEOUT = 5000; // 5 seconds for IP lookup
const PING_TIMEOUT = 3000; // 3 seconds for latency check

export interface VPNStatus {
  isInstalled: boolean;
  isConnected: boolean;
  server?: string;
  protocol?: string;
  output?: string;
}

export interface IPInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  isp: string;
}

export interface LatencyInfo {
  min: number;
  avg: number;
  max: number;
  loss: number;
}

/**
 * Check if ProtonVPN CLI is installed
 */
export async function checkProtonVPNInstalled(): Promise<boolean> {
  try {
    // Try both common command names
    try {
      await exec("which protonvpn-cli");
      return true;
    } catch {
      await exec("which protonvpn");
      return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Get the correct ProtonVPN command name
 */
export async function getProtonVPNCommand(): Promise<string> {
  try {
    await exec("which protonvpn-cli");
    return "protonvpn-cli";
  } catch {
    try {
      await exec("which protonvpn");
      return "protonvpn";
    } catch {
      throw new Error("ProtonVPN CLI not found");
    }
  }
}

/**
 * Check VPN connection status
 */
export async function getVPNStatus(): Promise<VPNStatus> {
  try {
    // 1. Check the kernel directly for the proton0 interface
    // This is the most reliable way on Linux.
    const isConnected = existsSync("/sys/class/net/proton0");

    let serverName = undefined;
    if (isConnected) {
      // 2. Only run nmcli if we know we are connected, to get the server label
      try {
        const { stdout } = await exec("nmcli -t -f NAME connection show --active");
        const match = stdout.match(/ProtonVPN\s+([^\n]+)/i);
        serverName = match ? match[1] : "ProtonVPN (WireGuard)";
      } catch {
        // nmcli might not be available, fallback to generic name
        serverName = "ProtonVPN (WireGuard)";
      }
    }

    return {
      isInstalled: true, // If we got here, we're likely installed
      isConnected,
      server: serverName,
    };
  } catch (error) {
    // Fallback: If FS check fails, try a simple grep
    try {
      const { stdout } = await exec("ip link show proton0");
      return { isInstalled: true, isConnected: stdout.includes("UP") };
    } catch {
      return { isInstalled: true, isConnected: false };
    }
  }
}

/**
 * Connect to ProtonVPN with retry logic
 */
export async function connectVPN(): Promise<string> {
  const cmd = await getProtonVPNCommand();

  // Check if already connected first
  const status = await getVPNStatus();
  if (status.isConnected) {
    throw new Error("Already connected to ProtonVPN");
  }

  try {
    const { stdout, stderr } = await exec(`${cmd} connect`);

    // Check if connection actually succeeded
    if (stderr && stderr.toLowerCase().includes("error")) {
      throw new Error(stderr);
    }

    return stdout;
  } catch (error: any) {
    // Provide more helpful error messages
    if (error.message.includes("not logged in")) {
      throw new Error("Please log in to ProtonVPN CLI first");
    } else if (error.message.includes("already")) {
      throw new Error("Already connected or connection in progress");
    }
    throw error;
  }
}

/**
 * Disconnect from ProtonVPN with retry logic
 */
export async function disconnectVPN(): Promise<string> {
  const cmd = await getProtonVPNCommand();

  // Check if already disconnected
  const status = await getVPNStatus();
  if (!status.isConnected) {
    throw new Error("Already disconnected from ProtonVPN");
  }

  try {
    const { stdout, stderr } = await exec(`${cmd} disconnect`);

    if (stderr && stderr.toLowerCase().includes("error")) {
      throw new Error(stderr);
    }

    return stdout;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Get IP information with timeout
 */
export async function getIPInfo(): Promise<IPInfo> {
  try {
    // We use -L to follow redirects, -H for User-Agent, and --max-time for timeout
    const { stdout } = await exec(
      `curl -sL --max-time ${CURL_TIMEOUT / 1000} -H "User-Agent: Mozilla/5.0" http://ip-api.com/json/`
    );

    if (!stdout || stdout.trim() === "") {
      throw new Error("Empty response from IP API");
    }

    const data = JSON.parse(stdout);

    // ip-api.com uses slightly different field names (status, country, regionName)
    if (data.status === "fail") {
      throw new Error(data.message || "IP lookup failed");
    }

    return {
      ip: data.query || "Unknown",
      city: data.city || "Unknown",
      region: data.regionName || "Unknown",
      country: data.country || "Unknown",
      countryCode: data.countryCode || "Unknown",
      isp: data.isp || "Unknown",
    };
  } catch (error) {
    console.error("IP Info Error:", error);
    return {
      ip: "0.0.0.0",
      city: "Lookup Failed",
      region: "N/A",
      country: "N/A",
      countryCode: "N/A",
      isp: "N/A",
    };
  }
}

/**
 * Get latency information with timeout
 */
export async function getLatency(): Promise<LatencyInfo> {
  try {
    const { stdout } = await exec(`ping -c 3 -W ${PING_TIMEOUT / 1000} 8.8.8.8`);
    const rttMatch = stdout.match(/rtt min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)/);
    const lossMatch = stdout.match(/([\d.]+)% packet loss/);
    return {
      min: rttMatch ? parseFloat(rttMatch[1]) : 0,
      avg: rttMatch ? parseFloat(rttMatch[2]) : 0,
      max: rttMatch ? parseFloat(rttMatch[3]) : 0,
      loss: lossMatch ? parseFloat(lossMatch[1]) : 0,
    };
  } catch {
    return { min: 0, avg: 0, max: 0, loss: 100 };
  }
}

/**
 * Update and return complete status
 */
export async function updateStatus() {
  const status = await getVPNStatus();
  const ip = await getIPInfo();
  // We only fetch latency if connected to avoid unnecessary ping timeouts
  const latency = status.isConnected ? await getLatency() : null;

  return {
    ...status,
    ipInfo: ip,
    latency,
  };
}

/**
 * Reconnect to ProtonVPN (change server)
 */
export async function reconnectVPN(): Promise<void> {
  try {
    const cmd = await getProtonVPNCommand();

    // Force a disconnect first to ensure we don't get an "Already Connected" error
    try {
      await exec(`${cmd} disconnect`);
    } catch {
      /* ignore disconnect errors */
    }

    // Wait a brief moment for the interface to clear
    await new Promise((r) => setTimeout(r, RECONNECT_DELAY));

    // Connect again (Proton will pick a new/best server)
    await exec(`${cmd} connect`);
  } catch (error: any) {
    throw new Error(error.stderr || error.message || "Reconnect failed");
  }
}
