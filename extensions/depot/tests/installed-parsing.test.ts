import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectAptRemovalPlan,
  isConservativeRemovalCandidate,
  parseAptRemovalSimulation,
  parseAptMarkOutput,
  parseDpkgInstalledMetadata,
  parseDpkgOwnershipOutput,
  resolveInstalledAptPackageId,
  selectManualProfilePackageIds,
  toAptPackageId,
} from "../src/backends/apt-installed-parsing.ts";
import { parseDpkgStatusOutput } from "../src/backends/apt-parsing.ts";
import { parseAptAutoremoveSimulation } from "../src/backends/cleanup-parsing.ts";
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

test("resolves only the exact installed APT package identity", () => {
  // Installed IDs are in APT form: bare for native, qualified for foreign.
  assert.equal(resolveInstalledAptPackageId("vlc", new Set(["vlc"])), "vlc");
  assert.equal(
    resolveInstalledAptPackageId("vlc", new Set(["vlc:i386"])),
    undefined,
  );
  assert.equal(
    resolveInstalledAptPackageId("vlc:i386", new Set(["vlc:amd64", "vlc:i386"])),
    "vlc:i386",
  );
});

test("treats another architecture as an additional APT removal", () => {
  assert.deepEqual(
    inspectAptRemovalPlan("vlc:amd64", ["vlc:amd64", "vlc:i386"]),
    { includesTarget: true, additionalIds: ["vlc:i386"] },
  );
  assert.deepEqual(inspectAptRemovalPlan("vlc:amd64", ["vlc:i386"]), {
    includesTarget: false,
    additionalIds: ["vlc:i386"],
  });
});

test("parses manually installed APT package IDs", () => {
  assert.deepEqual(
    [...parseAptMarkOutput("vlc\ncode\ninvalid package\n$(unsafe)\n")],
    ["vlc", "code"],
  );
});

test("keeps only installed non-critical manual packages for profiles", () => {
  const metadata = parseDpkgInstalledMetadata([
    "git\tii \tno\toptional\tvcs",
    "build-essential\tii \tno\toptional\tdevel",
    "coreutils\tii \tyes\trequired\tutils",
    "systemd\tii \tno\timportant\tadmin",
    "removed-app\trc \tno\toptional\tutils",
  ].join("\n"));

  assert.deepEqual(selectManualProfilePackageIds(
    new Set(["systemd", "git", "removed-app", "coreutils", "build-essential"]),
    metadata,
  ), ["build-essential", "git"]);
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

test("matches dpkg desktop-file owners with apt-mark manual packages", () => {
  const owners = parseDpkgOwnershipOutput(
    "openjdk-25-jre:amd64: /usr/share/applications/openjdk-25-java.desktop\n",
  ).get("/usr/share/applications/openjdk-25-java.desktop")
    ?.map((id) => toAptPackageId(id, NATIVE));
  const manual = parseAptMarkOutput("openjdk-25-jre\nwine32:i386\n");
  assert.deepEqual(owners?.filter((id) => manual.has(id)), ["openjdk-25-jre"]);
});

test("keeps native multiarch manual packages in profile exports", () => {
  assert.deepEqual(
    selectManualProfilePackageIds(
      parseAptMarkOutput("libjcat1\nlibc6:i386\nbash\n"),
      aptMetadata(DPKG_METADATA),
    ),
    ["libc6:i386", "libjcat1"],
  );
});

test("verifies native multiarch removals against apt-get output", () => {
  const installed = new Set(
    [...parseDpkgStatusOutput("libjcat1:amd64\tii \n")]
      .map((id) => toAptPackageId(id, NATIVE)),
  );
  const targetId = resolveInstalledAptPackageId("libjcat1", installed);
  assert.equal(targetId, "libjcat1");
  assert.deepEqual(
    inspectAptRemovalPlan(
      targetId!,
      parseAptRemovalSimulation("Remv libjcat1 [0.2.5-1build1]\n"),
    ),
    { includesTarget: true, additionalIds: [] },
  );
});

test("blocks removal of a foreign-architecture sibling", () => {
  const installed = new Set(
    [...parseDpkgStatusOutput("libfoo1:amd64\tii \nlibfoo1:i386\tii \n")]
      .map((id) => toAptPackageId(id, NATIVE)),
  );
  const targetId = resolveInstalledAptPackageId("libfoo1", installed);
  assert.equal(targetId, "libfoo1");
  assert.deepEqual(
    inspectAptRemovalPlan(
      targetId!,
      parseAptRemovalSimulation("Remv libfoo1:i386 [1.0]\nRemv libfoo1 [1.0]\n"),
    ),
    { includesTarget: true, additionalIds: ["libfoo1:i386"] },
  );
});

test("excludes boot, kernel, and system sections from profile exports", () => {
  const metadata = aptMetadata([
    "git\tii \tno\toptional\tvcs",
    "linux-generic-hwe-26.04\tii \tno\toptional\tkernel",
    "linux-image-generic\tii \tno\toptional\tkernel",
    "linux-headers-generic\tii \tno\toptional\tkernel",
    "grub-efi-amd64-signed\tii \tno\toptional\tutils",
    "shim-signed\tii \tno\toptional\tutils",
    "efibootmgr\tii \tno\toptional\tadmin",
    "efibootmgr-extra\tii \tno\toptional\tutils",
    "ubuntu-desktop\tii \tno\toptional\tmetapackages",
    "old-compat\tii \tno\toptional\toldlibs",
    "sudo\tii \tno\toptional\tadmin",
    "restricted-tool\tii \tno\toptional\trestricted/admin",
  ].join("\n"));
  assert.deepEqual(
    selectManualProfilePackageIds(new Set(metadata.keys()), metadata),
    ["efibootmgr-extra", "git"],
  );
});
