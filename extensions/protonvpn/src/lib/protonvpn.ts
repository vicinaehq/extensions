import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface Country {
  name: string;
  code: string;
}

export interface City {
  name: string;
}

export interface ConnectionStatus {
  connected: boolean;
  server?: string;
  country?: string;
  city?: string;
  ip?: string;
  protocol?: string;
  uptime?: string;
  load?: string;
}

export interface ConfigSetting {
  name: string;
  value: string;
  available: boolean;
}

export class ProtonVPNError extends Error {
  constructor(
    message: string,
    public readonly needsAuth: boolean = false,
  ) {
    super(message);
    this.name = "ProtonVPNError";
  }
}

export async function checkInstalled(): Promise<boolean> {
  try {
    await execFileAsync("which", ["protonvpn"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function checkSignedIn(): Promise<{ signedIn: boolean; error?: string }> {
  try {
    const { stdout } = await execFileAsync("protonvpn", ["info"], { timeout: 10000 });
    return { signedIn: stdout.includes("Account:") };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = ((error.stdout ?? "") + (error.stderr ?? "")).toLowerCase();
    if (output.includes("invalid access token") || output.includes("authentication required") || output.includes("sign in")) {
      return { signedIn: false };
    }
    return { signedIn: false, error: error.message ?? "Failed to check sign-in status" };
  }
}

async function runProtonvpn(args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync("protonvpn", args, {
      timeout: 30000,
    });
    const output = (stdout + stderr).split("\n").filter(
      (line) => !line.includes("Server list is outdated") && !line.includes("This may take a moment")
    ).join("\n");
    return output.trim();
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const rawOutput = (error.stdout ?? "") + (error.stderr ?? "");
    const output = rawOutput.toLowerCase();
    if (output.includes("invalid access token") || output.includes("authentication required") || output.includes("sign in")) {
      throw new ProtonVPNError("Not signed in. Run: protonvpn signin", true);
    }
    if (output.includes("not available on the free plan")) {
      throw new ProtonVPNError("This feature requires a paid ProtonVPN plan.", false);
    }
    if (output.includes("unexpected error")) {
      throw new ProtonVPNError("Connection failed. Try: protonvpn connect", false);
    }
    throw new ProtonVPNError(error.message ?? "Unknown error");
  }
}

export async function getStatus(): Promise<ConnectionStatus> {
  const output = await runProtonvpn(["status"]);
  if (output.includes("Disconnected")) {
    return { connected: false };
  }
  const lines = output.split("\n").filter((l) => l.trim());
  const result: ConnectionStatus = { connected: true };
  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    switch (key.trim().toLowerCase()) {
      case "server": result.server = value; break;
      case "country": result.country = value; break;
      case "city": result.city = value; break;
      case "ip": result.ip = value; break;
      case "protocol": result.protocol = value; break;
      case "uptime": result.uptime = value; break;
      case "load": result.load = value; break;
    }
  }
  return result;
}

export async function getCountries(): Promise<Country[]> {
  const output = await runProtonvpn(["countries", "list"]);
  const lines = output.split("\n").filter((l) => l.trim());
  const countries: Country[] = [];
  for (const line of lines) {
    if (line.startsWith("Country") || line.startsWith("-")) continue;
    const match = line.match(/^(.+?)\s{2,}([A-Z]{2})\s*$/);
    if (match) {
      countries.push({ name: match[1].trim(), code: match[2] });
    }
  }
  return countries;
}

export async function getCities(countryCode: string): Promise<City[]> {
  const output = await runProtonvpn(["cities", "list", countryCode]);
  const lines = output.split("\n").filter((l) => l.trim());
  const cities: City[] = [];
  for (const line of lines) {
    if (line.startsWith("City") || line.startsWith("Features") || line.startsWith("-")) continue;
    const name = line.trim();
    if (name && !name.includes("Error") && !name.includes("updating") && !name.includes("Cities in")) {
      cities.push({ name });
    }
  }
  return cities;
}

export async function connect(opts: {
  server?: string;
  country?: string;
  city?: string;
  p2p?: boolean;
  securecore?: boolean;
  tor?: boolean;
  random?: boolean;
}): Promise<string> {
  const args = ["connect"];
  if (opts.server) args.push(opts.server);
  if (opts.country) args.push("--country", opts.country);
  if (opts.city) args.push("--city", opts.city);
  if (opts.p2p) args.push("--p2p");
  if (opts.securecore) args.push("--securecore");
  if (opts.tor) args.push("--tor");
  if (opts.random) args.push("--random");
  return runProtonvpn(args);
}

export async function doDisconnect(): Promise<string> {
  const status = await getStatus();
  if (!status.connected) {
    return "Already disconnected";
  }
  return runProtonvpn(["disconnect"]);
}

export async function getConfig(): Promise<ConfigSetting[]> {
  const output = await runProtonvpn(["config", "list"]);
  const lines = output.split("\n");
  const settings: ConfigSetting[] = [];
  for (const line of lines) {
    const match = line.match(/^([a-z][a-z-]+)\s{2,}(.+?)$/);
    if (match) {
      const name = match[1].trim();
      const value = match[2].trim();
      const available = value !== "Upgrade to enable";
      settings.push({ name, value, available });
    }
  }
  return settings;
}

export async function setConfig(setting: string, value: string): Promise<string> {
  return runProtonvpn(["config", "set", setting, value]);
}
