/**
 * Smoke test against the Steam install on this machine. Skipped unless
 * LOCAL_STEAM=1, since CI and other machines won't have the same library.
 *
 *   LOCAL_STEAM=1 pnpm test local-steam
 */
import { describe, expect, it } from "vitest";
import { findSteamInstalls } from "../src/lib/steam/paths";
import { scanSteamInstall } from "../src/lib/steam/library";

describe.runIf(process.env.LOCAL_STEAM === "1")("local Steam install", () => {
  it("finds installed games and hides tools", () => {
    const installs = findSteamInstalls();
    expect(installs.length).toBeGreaterThan(0);
    for (const install of installs) {
      const withTools = scanSteamInstall(install, { includeTools: true });
      const result = scanSteamInstall(install);
      console.log(`\n${install.kind}: ${install.root}`);
      for (const w of withTools.warnings) console.log(`  warning: ${w}`);
      for (const g of withTools.games) {
        const art = Object.keys(g.artwork).join(",") || "none";
        const played = g.lastPlayed ? new Date(g.lastPlayed * 1000).toISOString().slice(0, 10) : "never";
        console.log(
          `  ${g.steam?.isTool ? "[tool]" : "      "} ${g.steam?.appid} ${g.title} type=${g.steam?.type} played=${played} ` +
            `minutes=${g.playtimeMinutes ?? "-"} art=${art} kw=${g.keywords.join("|")}`,
        );
      }
      expect(result.games.every((g) => !g.steam?.isTool)).toBe(true);
    }
  });
});
