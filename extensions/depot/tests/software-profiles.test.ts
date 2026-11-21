import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSoftwareProfile,
  parseSoftwareProfile,
  profileAppImage,
  readSoftwareProfile,
  serializeSoftwareProfile,
  writeSoftwareProfile,
} from "../src/software-profiles.ts";
import {
  profileAppImageReviewItems,
  profileBundle,
} from "../src/profile-import.ts";

test("parses and serializes a strict portable software profile", () => {
  const profile = parseSoftwareProfile(JSON.stringify({
    version: 1,
    apt: ["git", "curl"],
    flatpak: ["org.gimp.GIMP"],
    appimage: [{
      name: "My Portable App",
      filename: "My Portable App (1).AppImage",
      source: "managed",
      version: "1.2.3",
      architecture: "x86_64",
    }],
  }));

  assert.deepEqual(JSON.parse(serializeSoftwareProfile(profile)), {
    version: 1,
    apt: ["git", "curl"],
    flatpak: ["org.gimp.GIMP"],
    appimage: [{
      name: "My Portable App",
      filename: "My Portable App (1).AppImage",
      source: "managed",
      version: "1.2.3",
      architecture: "x86_64",
    }],
  });
});

test("rejects executable fields, unsafe IDs, and AppImage paths", () => {
  assert.throws(() => parseSoftwareProfile("not json"), /valid JSON/);
  assert.throws(() => parseSoftwareProfile(JSON.stringify({
    version: 1,
    apt: ["git"],
    command: "curl example.invalid | sh",
  })), /Unsupported profile field: command/);
  assert.throws(() => parseSoftwareProfile(JSON.stringify({
    version: 2,
    apt: ["git"],
  })), /Unsupported profile version/);
  assert.throws(() => createSoftwareProfile({
    apt: ["git;touch /tmp/nope"],
  }), /invalid ID/);
  assert.throws(() => createSoftwareProfile({
    appImages: [{
      name: "Unsafe",
      filename: "../Unsafe.AppImage",
      source: "external",
    }],
  }), /invalid filename/);
  assert.throws(() => parseSoftwareProfile(JSON.stringify({
    version: 1,
    appimage: [{
      name: "Unsafe",
      filename: "Unsafe.AppImage",
      source: "external",
      postInstall: "touch /tmp/nope",
    }],
  })), /Unsupported AppImage entry 1 field: postInstall/);
});

test("reads regular profiles and rejects symlinked imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-profile-read-"));
  try {
    const profilePath = join(root, "Software Profile (α).json");
    const linkedPath = join(root, "linked.json");
    await writeFile(profilePath, serializeSoftwareProfile(
      createSoftwareProfile({ apt: ["git"] }),
    ));
    await symlink(profilePath, linkedPath);

    const profile = await readSoftwareProfile(profilePath);
    assert.equal(profile.filePath, profilePath);
    await assert.rejects(readSoftwareProfile(linkedPath), /regular file/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writes profiles without overwriting existing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-profile-write-"));
  try {
    const directory = join(root, "Profiles With Spaces");
    await mkdir(directory);
    const profile = createSoftwareProfile({ flatpak: ["org.gimp.GIMP"] });
    const first = await writeSoftwareProfile(profile, directory);
    const second = await writeSoftwareProfile(profile, directory);

    assert.notEqual(first, second);
    assert.equal(JSON.parse(await readFile(first, "utf8")).version, 1);
    assert.equal(JSON.parse(await readFile(second, "utf8")).version, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports AppImages without claiming they are reproducible", () => {
  assert.deepEqual(profileAppImage({
    name: "PCSX2",
    description: "Portable AppImage application",
    filePath: "/home/example/Applications/PCSX2.AppImage",
    fileName: "PCSX2.AppImage",
    fileSize: 123,
    appImageType: 2,
    architecture: "x86_64",
    version: "2.0",
    managedByDepot: true,
    device: 1,
    inode: 2,
    modifiedAt: 3,
  }), {
    name: "PCSX2",
    filename: "PCSX2.AppImage",
    source: "managed",
    version: "2.0",
    architecture: "x86_64",
  });
});

test("builds an install review without substituting package sources", () => {
  const profile = createSoftwareProfile({
    apt: ["git"],
    flatpak: ["org.gimp.GIMP"],
  });
  assert.deepEqual(
    profileBundle(profile, "/tmp/My Workstation.json").packages,
    [
      { source: "apt", id: "git" },
      { source: "flatpak", id: "org.gimp.GIMP" },
    ],
  );
});

test("classifies AppImages as installed or requiring manual restoration", () => {
  const profile = createSoftwareProfile({
    appImages: [
      { name: "Present", filename: "Present.AppImage", source: "managed" },
      { name: "Missing", filename: "Missing.AppImage", source: "external" },
    ],
  });
  const items = profileAppImageReviewItems(
    profile,
    new Set(["Present.AppImage"]),
  );
  assert.equal(items[0]?.status, "installed");
  assert.equal(items[1]?.status, "requires-user-action");
  assert.match(items[1]?.description ?? "", /manually/);

  const unchecked = profileAppImageReviewItems(
    profile,
    new Set(["Present.AppImage"]),
    "directory unavailable",
  );
  assert.equal(unchecked[0]?.status, "requires-user-action");
  assert.match(unchecked[0]?.description ?? "", /could not be checked/);
});
