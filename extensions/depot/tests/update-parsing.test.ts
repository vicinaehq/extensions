import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAptUpgradableOutput,
  parseAptUpgradeSimulation,
  selectInstallableUpdates,
} from "../src/backends/apt-update-parsing.ts";
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

// Real `apt-get --simulate --with-new-pkgs upgrade` output on Ubuntu 26.04
// while fwupd and libgtk-4-1 were still phasing.
const PHASED_SIMULATION = `Calculating upgrade...
The following upgrades have been deferred due to phasing:
  fwupd libgtk-4-1
The following packages will be upgraded:
  code
1 upgraded, 0 newly installed, 0 to remove and 2 not upgraded.
Inst code [1.146.0-1794340865] (1.147.0-1794903003 code stable:stable [amd64])
Inst libexpat1:i386 [2.7.4-1] (2.7.4-1ubuntu0.2 Ubuntu:26.04/resolute-updates [i386])
Conf code (1.147.0-1794903003 code stable:stable [amd64])
`;
const UPGRADABLE_LISTING = `Listing...
code/stable 1.147.0-1794903003 amd64 [upgradable from: 1.146.0-1794340865]
fwupd/resolute-updates 2.1.6-3ubuntu4~26.04.1 amd64 [upgradable from: 2.1.1-1ubuntu3.1]
libexpat1/resolute-updates 2.7.4-1ubuntu0.2 i386 [upgradable from: 2.7.4-1]
libgtk-4-1/resolute-updates 4.22.4+ds-0ubuntu0.2 amd64 [upgradable from: 4.22.4+ds-0ubuntu0.1]
`;

test("reads only updates an APT upgrade would install now", () => {
  assert.deepEqual(
    [...parseAptUpgradeSimulation(PHASED_SIMULATION)],
    ["code:amd64", "libexpat1:i386"],
  );
});

test("excludes phased and held APT updates", () => {
  const records = parseAptUpgradableOutput(UPGRADABLE_LISTING);
  const upgradeable = parseAptUpgradeSimulation(PHASED_SIMULATION);
  assert.deepEqual(
    selectInstallableUpdates(records, upgradeable, new Set()).map((r) => r.id),
    ["code:amd64", "libexpat1:i386"],
  );
  // `apt-mark showhold` prints native holds bare and foreign holds qualified.
  assert.deepEqual(
    selectInstallableUpdates(records, upgradeable, new Set(["code"])).map((r) => r.id),
    ["libexpat1:i386"],
  );
  assert.deepEqual(
    selectInstallableUpdates(records, upgradeable, new Set(["libexpat1:i386"]))
      .map((r) => r.id),
    ["code:amd64"],
  );
});
