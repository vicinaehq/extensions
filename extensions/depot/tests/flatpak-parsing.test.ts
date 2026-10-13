import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidFlatpakAppId,
  isValidFlatpakRemoteName,
  parseFlatpakInstalledOutput,
  parseFlatpakInstalledApplicationsOutput,
  parseFlatpakRemotesOutput,
  parseFlatpakSearchOutput,
  rankFlatpakSearchResults,
  selectFlatpakSearchScopes,
  selectFlatpakRemote,
  sortFlatpakScopes,
} from "../src/backends/flatpak-parsing.ts";
import { requireFlatpakExecutable } from "../src/backends/flatpak-availability.ts";

test("parses Flatpak search output and ignores malformed records", () => {
  const output = [
    "VLC\tMedia player\torg.videolan.VLC\t3.0.23\tstable\tflathub",
    "Spotify\tMusic streaming\tcom.spotify.Client\t1.2.3\tstable\tcompany,flathub",
    "Broken\tMissing fields\tbad-id\t1\tstable\tflathub",
    "No remote\tInvalid\torg.example.Empty\t1\tstable\t",
    "",
  ].join("\n");

  assert.deepEqual(parseFlatpakSearchOutput(output, "user"), [
    {
      id: "org.videolan.VLC",
      name: "VLC",
      description: "Media player",
      version: "3.0.23",
      branch: "stable",
      remotes: ["flathub"],
      scope: "user",
    },
    {
      id: "com.spotify.Client",
      name: "Spotify",
      description: "Music streaming",
      version: "1.2.3",
      branch: "stable",
      remotes: ["company", "flathub"],
      scope: "user",
    },
  ]);
  assert.deepEqual(parseFlatpakSearchOutput("", "system"), []);
});

test("parses remotes and continues without Flathub", () => {
  assert.deepEqual(
    parseFlatpakRemotesOutput(
      "company\tCompany Apps\thttps://example.invalid/repo\ninvalid remote\n",
      "system",
    ),
    [{ name: "company", scope: "system" }],
  );
  assert.equal(selectFlatpakRemote(["company", "flathub"]), "flathub");
  assert.equal(selectFlatpakRemote(["company"]), "company");
  assert.equal(selectFlatpakRemote([]), undefined);
});

test("searches every configured Flatpak scope in preference order", () => {
  assert.deepEqual(
    selectFlatpakSearchScopes(
      [
        { name: "flathub", scope: "user" },
        { name: "flathub", scope: "system" },
      ],
      "user",
    ),
    ["user", "system"],
  );
  assert.deepEqual(
    selectFlatpakSearchScopes(
      [
        { name: "flathub", scope: "user" },
        { name: "company", scope: "system" },
      ],
      "user",
    ),
    ["user", "system"],
  );
  assert.deepEqual(
    selectFlatpakSearchScopes(
      [
        { name: "flathub", scope: "user" },
        { name: "flathub", scope: "system" },
      ],
      "system",
    ),
    ["system", "user"],
  );
});

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

test("ranks friendly exact matches and prefers the requested scope", () => {
  const records = parseFlatpakSearchOutput(
    [
      "Spotify plugin\tAdds Spotify support\torg.example.Spotify.Plugin\t1\tstable\tcompany",
      "Spotify\tMusic streaming\tcom.spotify.Client\t1\tstable\tflathub",
    ].join("\n"),
    "system",
  );
  const duplicateInUserScope = {
    ...records[1]!,
    scope: "user" as const,
  };
  const ranked = rankFlatpakSearchResults(
    [...records, duplicateInUserScope],
    "spotify",
    "user",
    10,
  );

  assert.equal(ranked[0]?.id, "com.spotify.Client");
  assert.equal(ranked[0]?.scope, "user");
  assert.deepEqual(sortFlatpakScopes(["system", "user"], "user"), [
    "user",
    "system",
  ]);
});

test("validates Flatpak IDs and remote names", () => {
  assert.equal(isValidFlatpakAppId("org.videolan.VLC"), true);
  assert.equal(isValidFlatpakAppId("$(touch-pwned)"), false);
  assert.equal(isValidFlatpakRemoteName("company-apps"), true);
  assert.equal(isValidFlatpakRemoteName("company apps; id"), false);
});

test("reports a missing Flatpak binary without failing APT", async () => {
  await assert.rejects(requireFlatpakExecutable("/definitely/missing-flatpak"));
});
