import assert from "node:assert/strict";
import test from "node:test";
import { parseAptUpgradableOutput } from "../src/backends/apt-update-parsing.ts";
import { parseFlatpakUpdatesOutput } from "../src/backends/flatpak-parsing.ts";

test("parses APT upgrade records including multiarch packages", () => {
  const records = parseAptUpgradableOutput([
    "Listing...",
    "chatgpt/stable 26.917.71314 amd64 [upgradable from: 26.915.31945]",
    "libexpat1/resolute-updates,resolute-security 2.7.4-1ubuntu0.2 i386 [upgradable from: 2.7.4-1]",
    "malformed update",
  ].join("\n"));

  assert.deepEqual(records, [
    {
      id: "chatgpt:amd64",
      name: "chatgpt",
      repository: "stable",
      architecture: "amd64",
      currentVersion: "26.915.31945",
      availableVersion: "26.917.71314",
    },
    {
      id: "libexpat1:i386",
      name: "libexpat1",
      repository: "resolute-updates,resolute-security",
      architecture: "i386",
      currentVersion: "2.7.4-1",
      availableVersion: "2.7.4-1ubuntu0.2",
    },
  ]);
  assert.deepEqual(parseAptUpgradableOutput(""), []);
});

test("parses cached Flatpak application updates", () => {
  assert.deepEqual(
    parseFlatpakUpdatesOutput(
      "Telegram\tMessaging\torg.telegram.desktop\t7.2.9\tstable\tflathub\t100.2 MB\n",
      "system",
    ),
    [{
      id: "org.telegram.desktop",
      name: "Telegram",
      description: "Messaging",
      availableVersion: "7.2.9",
      branch: "stable",
      remote: "flathub",
      downloadSize: "100.2 MB",
      scope: "system",
    }],
  );
  assert.deepEqual(parseFlatpakUpdatesOutput("malformed\n", "user"), []);
});
