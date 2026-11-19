import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidFlatpakAppId,
  isValidFlatpakRemoteName,
  parseFlatpakInstalledApplicationsOutput,
  parseFlatpakInstalledOutput,
} from "../src/backends/flatpak-parsing.ts";

test("parses installed Flatpak applications and their scopes", () => {
  const installed = parseFlatpakInstalledOutput(
    [
      "org.videolan.VLC\tstable\tflathub\tuser",
      "com.example.App\tstable\tcompany\tsystem",
      "malformed",
    ].join("\n"),
    "user",
  );

  assert.deepEqual(installed, [
    {
      id: "org.videolan.VLC",
      branch: "stable",
      remote: "flathub",
      scope: "user",
    },
    {
      id: "com.example.App",
      branch: "stable",
      remote: "company",
      scope: "system",
    },
  ]);
});

test("parses installed Flatpak application presentation metadata", () => {
  assert.deepEqual(
    parseFlatpakInstalledApplicationsOutput(
      "VLC\tMedia player\torg.videolan.VLC\t3.0.23\tstable\tflathub\tsystem\n",
      "user",
    ),
    [{
      id: "org.videolan.VLC",
      name: "VLC",
      description: "Media player",
      version: "3.0.23",
      branch: "stable",
      remote: "flathub",
      scope: "system",
    }],
  );
});

test("validates Flatpak IDs and remote names", () => {
  assert.equal(isValidFlatpakAppId("org.videolan.VLC"), true);
  assert.equal(isValidFlatpakAppId("$(touch-pwned)"), false);
  assert.equal(isValidFlatpakRemoteName("company-apps"), true);
  assert.equal(isValidFlatpakRemoteName("company apps; id"), false);
});
