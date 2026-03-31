import { Color } from "@vicinae/api";
import type { ProtonDBTier, SteamRequirements } from "../types";

export function getTierColor(tier: ProtonDBTier | undefined): Color {
  if (!tier) return Color.SecondaryText;

  const tierColors: Record<ProtonDBTier, Color> = {
    native: Color.Blue,
    platinum: Color.Purple,
    gold: Color.Yellow,
    silver: Color.Orange,
    bronze: Color.Orange,
    borked: Color.Red,
    pending: Color.SecondaryText,
  };

  return tierColors[tier];
}

export function formatTierName(tier: ProtonDBTier | undefined): string {
  if (!tier) return "Unknown";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function getScoreColor(score: number): Color {
  if (score < 0.3) return Color.Red;
  if (score < 0.5) return Color.Orange;
  if (score < 0.7) return Color.Yellow;
  return Color.Green;
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function requirementsHtmlToMarkdown(html: string): string {
  if (!html) return "";

  const withoutHeader = html.replace(/<strong>(minimum|recommended):<\/strong>\s*/gi, "");

  const rows: [string, string][] = [];
  const pattern = /<strong>([^<]+):<\/strong>\s*(.*?)(?=<strong>|<\/ul>|$)/gis;
  for (const match of withoutHeader.matchAll(pattern)) {
    const key = decodeHtmlEntities(match[1].trim());
    const value = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, "").trim());
    if (key && value) rows.push([key, value]);
  }

  if (rows.length === 0) {
    return decodeHtmlEntities(
      withoutHeader
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    );
  }

  return rows.map(([k, v]) => `**${k}:** ${v}`).join("\n\n");
}

export function formatRequirementsSection(
  pcReqs: SteamRequirements | null | undefined,
  linuxReqs: SteamRequirements | null | undefined,
): string {
  const sections: string[] = [];

  function reqText(reqs: SteamRequirements | null | undefined): string {
    if (!reqs || Array.isArray(reqs)) return "";
    const raw = typeof reqs === "string" ? reqs : reqs.minimum || "";
    return requirementsHtmlToMarkdown(raw);
  }

  const pc = reqText(pcReqs);
  if (pc) sections.push(`## System Requirements (PC)\n\n${pc}`);

  const linux = reqText(linuxReqs);
  if (linux) sections.push(`## System Requirements (Linux)\n\n${linux}`);

  return sections.join("\n\n");
}
