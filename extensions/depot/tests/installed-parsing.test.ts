import assert from "node:assert/strict";
import test from "node:test";
import {
  isConservativeRemovalCandidate,
  parseAptMarkOutput,
  parseDpkgInstalledMetadata,
  toAptPackageId,
} from "../src/backends/apt-installed-parsing.ts";
import { parseAptAutoremoveSimulation } from "../src/backends/cleanup-parsing.ts";

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

test("parses manually installed APT package IDs", () => {
  assert.deepEqual(
    [...parseAptMarkOutput("vlc\ncode\ninvalid package\n$(unsafe)\n")],
    ["vlc", "code"],
  );
});

// Real output shapes from Ubuntu amd64 with i386 enabled: dpkg qualifies
// native "Multi-Arch: same" packages, apt-get/apt-mark do not.
const NATIVE = "amd64";
const DPKG_METADATA = [
  "libjcat1:amd64\tii \tno\toptional\tlibs",
  "libc6:amd64\tii \tno\trequired\tlibs",
  "libc6:i386\tii \tno\toptional\tlibs",
  "bash\tii \tyes\trequired\tshells",
].join("\n");

function aptMetadata(output: string) {
  return new Map(
    [...parseDpkgInstalledMetadata(output).values()].map((record) => {
      const id = toAptPackageId(record.id, NATIVE);
      return [id, { ...record, id }] as const;
    }),
  );
}

test("converts dpkg multiarch identifiers to APT form", () => {
  assert.equal(toAptPackageId("libjcat1:amd64", NATIVE), "libjcat1");
  assert.equal(toAptPackageId("libc6:i386", NATIVE), "libc6:i386");
  assert.equal(toAptPackageId("bash", NATIVE), "bash");
});

test("finds protection metadata for native multiarch cleanup candidates", () => {
  const plan = parseAptAutoremoveSimulation("Purg libjcat1 [0.2.5-1build1]\n");
  const metadata = aptMetadata(DPKG_METADATA);
  assert.deepEqual(
    plan.packageIds.filter((id) => !isConservativeRemovalCandidate(metadata.get(id))),
    [],
  );
});
