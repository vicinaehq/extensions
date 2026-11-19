import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAptPackageDetails,
  parseDpkgStatusOutput,
} from "../src/backends/apt-parsing.ts";

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
