import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeAptSearchPattern,
  isValidAptPackageId,
  parseAptPackageDetails,
  parseAptSearchOutput,
  parseDpkgStatusOutput,
  rankAptSearchResults,
} from "../src/backends/apt-parsing.ts";

test("parses APT search output and ignores malformed lines", () => {
  const output = [
    "vlc - multimedia player and streamer",
    "libvlc-bin - tools for VLC's base library",
    "malformed output",
    "bad$id - invalid package name",
    "",
  ].join("\n");

  assert.deepEqual(parseAptSearchOutput(output), [
    { id: "vlc", description: "multimedia player and streamer" },
    { id: "libvlc-bin", description: "tools for VLC's base library" },
  ]);
  assert.deepEqual(parseAptSearchOutput(""), []);
});

test("ranks exact and name matches ahead of description matches", () => {
  const ranked = rankAptSearchResults(
    [
      { id: "streamer-tools", description: "works with vlc" },
      { id: "libvlc-bin", description: "VLC tools" },
      { id: "vlc-plugin-base", description: "VLC plugins" },
      { id: "vlc", description: "media player" },
      { id: "vlc", description: "multimedia player and streamer" },
    ],
    "vlc",
    3,
  );

  assert.deepEqual(ranked.map((record) => record.id), [
    "vlc",
    "vlc-plugin-base",
    "libvlc-bin",
  ]);
  assert.equal(ranked[0]?.description, "multimedia player and streamer");
});

test("maps multi-word queries to hyphenated package names", () => {
  const ranked = rankAptSearchResults(
    [
      { id: "obs-advanced-masks", description: "plugin for OBS Studio" },
      { id: "obs-studio", description: "recorder and streamer" },
      { id: "libobs-dev", description: "OBS Studio development files" },
    ],
    "obs studio",
    3,
  );

  assert.equal(ranked[0]?.id, "obs-studio");
});

test("parses APT details with multiline descriptions", () => {
  const details = parseAptPackageDetails(`Package: vlc
Version: 3.0.23-1
Homepage: https://www.videolan.org/vlc/
Description-en: multimedia player and streamer
 VLC plays many audio and video formats.
 .
 It can also stream media.

Package: vlc
Version: older
`);

  assert.deepEqual(details, {
    id: "vlc",
    description: "multimedia player and streamer",
    longDescription: "VLC plays many audio and video formats.\n\nIt can also stream media.",
    version: "3.0.23-1",
    homepage: "https://www.videolan.org/vlc/",
  });
  assert.equal(parseAptPackageDetails(""), undefined);
  assert.equal(parseAptPackageDetails("not a control stanza"), undefined);
});

test("detects installed packages from dpkg status output", () => {
  const installed = parseDpkgStatusOutput(
    "vlc\tii \nremoved-package\trc \nother-package\tii \nmalformed\n",
  );

  assert.deepEqual([...installed], ["vlc", "other-package"]);
  assert.deepEqual([...parseDpkgStatusOutput("")], []);
});

test("validates package IDs and escapes search input as a literal regex", () => {
  assert.equal(isValidAptPackageId("libc6:amd64"), true);
  assert.equal(isValidAptPackageId("obs-studio"), true);
  assert.equal(isValidAptPackageId("$(touch-pwned)"), false);
  assert.equal(escapeAptSearchPattern("vlc.*[x]"), "vlc\\.\\*\\[x\\]");
});
