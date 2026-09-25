import assert from "node:assert/strict";
import test from "node:test";
import {
  isConservativeRemovalCandidate,
  parseAptRemovalSimulation,
  parseAptMarkOutput,
  parseDpkgInstalledMetadata,
  parseDpkgOwnershipOutput,
} from "../src/backends/apt-installed-parsing.ts";
import { parseDesktopEntry } from "../src/backends/desktop-entry.ts";

test("parses visible desktop application metadata", () => {
  assert.deepEqual(parseDesktopEntry(`[Desktop Entry]
Type=Application
Name=VLC media player
Name[fr]=Lecteur multimédia VLC
Comment=Play media\\nfiles
Exec=/usr/bin/vlc %U
NoDisplay=false
`), {
    name: "VLC media player",
    description: "Play media files",
    hidden: false,
    noDisplay: false,
  });
  assert.equal(parseDesktopEntry("[Desktop Entry]\nType=Link\nName=Site"), undefined);
  assert.equal(parseDesktopEntry(""), undefined);
});

test("maps desktop files to valid Debian package owners", () => {
  const owners = parseDpkgOwnershipOutput([
    "vlc: /usr/share/applications/vlc.desktop",
    "libreoffice-common, libreoffice-writer: /usr/share/applications/writer.desktop",
    "invalid owner: /usr/share/applications/bad.desktop",
    "diversion by package",
  ].join("\n"));

  assert.deepEqual(owners.get("/usr/share/applications/vlc.desktop"), ["vlc"]);
  assert.deepEqual(owners.get("/usr/share/applications/writer.desktop"), [
    "libreoffice-common",
    "libreoffice-writer",
  ]);
  assert.equal(owners.has("/usr/share/applications/bad.desktop"), false);
});

test("filters essential and high-priority APT packages", () => {
  const metadata = parseDpkgInstalledMetadata([
    "vlc\tii \tno\toptional\tvideo",
    "coreutils\tii \tyes\trequired\tutils",
    "important-app\tii \tno\timportant\tadmin",
    "removed-app\trc \tno\toptional\tutils",
  ].join("\n"));

  assert.equal(isConservativeRemovalCandidate(metadata.get("vlc")), true);
  assert.equal(isConservativeRemovalCandidate(metadata.get("coreutils")), false);
  assert.equal(isConservativeRemovalCandidate(metadata.get("important-app")), false);
  assert.equal(isConservativeRemovalCandidate(metadata.get("removed-app")), false);
});

test("parses exact packages from an APT removal simulation", () => {
  assert.deepEqual(
    parseAptRemovalSimulation("Remv vlc [3.0.23]\nRemv dependent-app [1.0]\n"),
    ["vlc", "dependent-app"],
  );
  assert.deepEqual(parseAptRemovalSimulation("No packages will be removed"), []);
});

test("parses manually installed APT package IDs", () => {
  assert.deepEqual(
    [...parseAptMarkOutput("vlc\ncode\ninvalid package\n$(unsafe)\n")],
    ["vlc", "code"],
  );
});
