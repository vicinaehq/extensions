import type { UsageWindow } from "../agents/windowed.ts";
import type { AmpUsage } from "./types.ts";

/**
 * Pure parser for the Amp usage display text — the same text the `amp usage`
 * CLI prints and the userDisplayBalanceInfo endpoint returns:
 *
 *   Signed in as user@example.com (My Org)
 *   Amp Free: $4.20 / $10.00 remaining (replenishes +$0.42 / hour)
 *   Amp Free: 42% remaining today (resets daily)
 *   Subscription Gigawatt: 45% other usage and 80% orb usage remaining - resets upon renewal in 12 days
 *   Individual credits: $25.00 remaining
 *   Workspace acme: $10.00 remaining
 */

const AMOUNT = String.raw`([0-9][0-9,]*(?:\.[0-9]+)?)`;

const IDENTITY_RE = /^\s*Signed in as\s+(\S+)(?:\s+\(([^\r\n)]+)\))?\s*$/im;
const FREE_DOLLARS_RE = new RegExp(
  String.raw`^\s*Amp Free:\s*\$?` + AMOUNT + String.raw`\s*/\s*\$?` + AMOUNT +
    String.raw`\s+remaining(?:\s*\(replenishes\s*\+\$?` + AMOUNT + String.raw`\s*/\s*hour\))?`,
  "im",
);
const FREE_PERCENT_RE = new RegExp(
  String.raw`^\s*Amp Free:\s*` + AMOUNT + String.raw`\s*%\s+remaining(?:\s+today)?\s*(\(resets\s+daily\))?`,
  "im",
);
const SUBSCRIPTION_RES = [
  new RegExp(
    String.raw`^\s*Subscription\s+(.+?):` + String.raw`\s*` + AMOUNT + String.raw`%\s+other\s+usage\s+and\s+` +
      AMOUNT + String.raw`%\s+orb\s+usage\s+remaining\s*-\s*resets\s+upon\s+renewal\s+in\s+([0-9][0-9,]*)\s+(days?|months?)(?:\s+-\s+https?:\/\/\S+)?\s*$`,
    "im",
  ),
  new RegExp(
    String.raw`^\s*Amp\s+(.+?)\s+Subscription:` + String.raw`\s*` + AMOUNT + String.raw`%\s+other\s+usage\s+and\s+` +
      AMOUNT + String.raw`%\s+orb\s+usage\s+remaining\s*-\s*resets\s+upon\s+renewal\s+in\s+([0-9][0-9,]*)\s+(days?|months?)(?:\s+-\s+https?:\/\/\S+)?\s*$`,
    "im",
  ),
];
const CREDITS_RE = new RegExp(String.raw`^\s*Individual credits:\s*\$?` + AMOUNT + String.raw`\s+remaining`, "im");
const WORKSPACE_RE = new RegExp(String.raw`^\s*Workspace\s+(.+?):\s*\$?` + AMOUNT + String.raw`\s+remaining`, "gim");

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\*\*/g, "");
}

/** Approximate renewal date for "renews in N days/months" hints. */
function renewalMs(value: number, unit: string, nowMs: number): number {
  const days = unit.toLowerCase().startsWith("month") ? value * 30 : value;
  return nowMs + days * 24 * 60 * 60 * 1000;
}

export function parseAmpDisplay(displayText: string, nowMs: number = Date.now()): AmpUsage | null {
  const text = stripAnsi(displayText);
  const identityMatch = IDENTITY_RE.exec(text);
  const identity = identityMatch?.[2]?.trim() ?? identityMatch?.[1]?.trim() ?? null;

  const windows: UsageWindow[] = [];
  const extras: { title: string; text: string }[] = [];

  const freeDollars = FREE_DOLLARS_RE.exec(text);
  const freePercent = FREE_PERCENT_RE.exec(text);
  if (freeDollars) {
    const remaining = num(freeDollars[1]);
    const quota = num(freeDollars[2]);
    const hourly = num(freeDollars[3]);
    if (remaining !== null && quota !== null && quota > 0) {
      windows.push({
        id: "amp-free",
        title: "Amp Free — Daily",
        usedPercent: Math.min(100, Math.max(0, ((quota - remaining) / quota) * 100)),
        resetsText: "daily (8 PM ET)",
        valueText: `$${remaining.toFixed(2)} / $${quota.toFixed(2)}`,
        note: hourly !== null && hourly > 0 ? `replenishes $${hourly.toFixed(2)}/h` : undefined,
      });
    }
  } else if (freePercent) {
    const remaining = num(freePercent[1]);
    if (remaining !== null) {
      windows.push({
        id: "amp-free",
        title: "Amp Free — Daily",
        usedPercent: 100 - Math.min(100, Math.max(0, remaining)),
        resetsText: freePercent[2] ? "daily" : "daily (8 PM ET)",
      });
    }
  }

  let planName: string | null = null;
  const subMatch = SUBSCRIPTION_RES.map((re) => re.exec(text)).find((m) => m !== null);
  if (subMatch) {
    planName = subMatch[1].trim();
    const otherRemaining = num(subMatch[2]);
    const orbRemaining = num(subMatch[3]);
    const renewalValue = num(subMatch[4]);
    const resetsAtMs = renewalValue !== null ? renewalMs(renewalValue, subMatch[5], nowMs) : null;
    if (otherRemaining !== null) {
      windows.push({
        id: "sub-other",
        title: `${planName} — Other Usage`,
        usedPercent: 100 - Math.min(100, Math.max(0, otherRemaining)),
        resetsAtMs,
      });
    }
    if (orbRemaining !== null) {
      windows.push({
        id: "sub-orb",
        title: `${planName} — Orb Usage`,
        usedPercent: 100 - Math.min(100, Math.max(0, orbRemaining)),
        resetsAtMs,
      });
    }
  }

  const credits = CREDITS_RE.exec(text);
  if (credits) {
    const value = num(credits[1]);
    if (value !== null) extras.push({ title: "Individual Credits", text: `$${value.toFixed(2)}` });
  }
  for (const match of text.matchAll(WORKSPACE_RE)) {
    const name = match[1].trim();
    const value = num(match[2]);
    if (value !== null) extras.push({ title: `Workspace ${name}`, text: `$${value.toFixed(2)}` });
  }

  if (windows.length === 0 && extras.length === 0) return null;
  return { plan: planName, identity, windows, extras };
}
