import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { COUNTRY_CODES } from "./flags";

const exec = promisify(execFile);
const nordvpn = async (...args: string[]) => (await exec("nordvpn", args, { timeout: 60_000 })).stdout;

export type Status = { connected: boolean; country?: string; city?: string; server?: string; ip?: string; uptime?: string };

export async function status(): Promise<Status> {
  const out = await nordvpn("status");
  const get = (key: string) => out.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim();
  return {
    connected: get("Status") === "Connected",
    country: get("Country"),
    city: get("City"),
    server: get("Hostname"),
    ip: get("IP"),
    uptime: get("Uptime"),
  };
}

// the CLI wraps its lists in spinner characters
const names = (out: string) =>
  out
    .split(/[\s,]+/)
    .map((s) => s.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((s) => s.length > 1)
    .sort();

export const countries = async () => names(await nordvpn("countries"));
export const cities = async (country: string) => names(await nordvpn("cities", country));
export const disconnect = () => nordvpn("disconnect");
export const connect = async (...target: string[]) =>
  (await nordvpn("connect", ...target)).match(/You are connected to ([^(\n]+?) \(/)?.[1] ?? "NordVPN";

export const pretty = (name: string) => name.replace(/_/g, " ");
export function errorText(e: unknown) {
  const { stderr, stdout, message } = e as { stderr?: string; stdout?: string; message?: string };
  return String(stderr?.trim() || stdout?.trim() || message || e).split("\n").pop()?.trim();
}

export function flag(country: string) {
  const code = COUNTRY_CODES[country.toLowerCase()];
  return code ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🌐";
}
