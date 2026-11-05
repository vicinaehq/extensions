import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagedDesktopEntry,
  isDebianArchiveHeader,
  looksLikeFlatpakRef,
  parseAppImageDesktopEntry,
  parseAppImageHeader,
  parseDebianControl,
  parseFlatpakBundle,
  parseFlatpakRef,
  parseInstalledDebOutput,
  sanitizeManagedFileStem,
} from "../src/local-packages/parsing.ts";

test("parses Debian control metadata including multiline descriptions", () => {
  const parsed = parseDebianControl([
    "Package: example-app",
    "Version: 2.4.1-1",
    "Architecture: amd64",
    "Description: Example application",
    " A second line.",
    " .",
    " A second paragraph.",
    "Homepage: https://example.com/app",
  ].join("\n"));

  assert.deepEqual(parsed, {
    packageId: "example-app",
    version: "2.4.1-1",
    architecture: "amd64",
    description: "Example application\nA second line.\n\nA second paragraph.",
    homepage: "https://example.com/app",
  });
  assert.equal(isDebianArchiveHeader(Buffer.from("!<arch>\nrest")), true);
  assert.deepEqual(parseInstalledDebOutput("ii \t2.4.1-1\n"), {
    version: "2.4.1-1",
  });
});

test("rejects malicious Debian identifiers and homepage schemes", () => {
  assert.equal(parseDebianControl([
    "Package: foo;touch /tmp/pwned",
    "Version: 1",
    "Architecture: amd64",
    "Description: Bad",
  ].join("\n")), undefined);

  const parsed = parseDebianControl([
    "Package: safe-package",
    "Version: 1",
    "Architecture: amd64",
    "Description: Safe",
    "Homepage: javascript:alert(1)",
  ].join("\n"));
  assert.equal(parsed?.homepage, undefined);
});

test("parses an application Flatpak reference without evaluating fields", () => {
  const content = [
    "[Flatpak Ref]",
    "Version=1",
    "Name=org.example.App",
    "Title=Example App",
    "Branch=stable",
    "Url=https://example.com/repo/",
    "RuntimeRepo=https://example.com/runtime.flatpakrepo",
    "SuggestRemoteName=example;touch /tmp/nope",
  ].join("\n");

  assert.equal(looksLikeFlatpakRef(content), true);
  assert.deepEqual(parseFlatpakRef(content), {
    appId: "org.example.App",
    name: "Example App",
    branch: "stable",
    remoteUrl: "https://example.com/repo/",
    runtimeRepository: "https://example.com/runtime.flatpakrepo",
  });
});

test("rejects runtime and unsupported Flatpak references", () => {
  assert.equal(parseFlatpakRef([
    "[Flatpak Ref]",
    "Version=1",
    "Name=org.example.Platform",
    "Url=https://example.com/repo/",
    "IsRuntime=true",
  ].join("\n")), undefined);
  assert.equal(parseFlatpakRef([
    "[Flatpak Ref]",
    "Version=2",
    "Name=org.example.App",
    "Url=https://example.com/repo/",
  ].join("\n")), undefined);
});

test("parses Flatpak application bundle repository output", () => {
  const parsed = parseFlatpakBundle(
    [
      "runtime/org.example.Platform/x86_64/stable\t100 MB\t50 MB",
      "app/org.example.App/x86_64/stable\t78.3 MB\t35.7 MB\tverified",
    ].join("\n"),
    "[Application]\nname=org.example.App\nruntime=org.freedesktop.Platform/x86_64/25.08\n",
  );
  assert.deepEqual(parsed, {
    appId: "org.example.App",
    architecture: "x86_64",
    branch: "stable",
    runtime: "org.freedesktop.Platform/x86_64/25.08",
    installedSize: "78.3 MB",
    downloadSize: "35.7 MB",
  });
});

test("validates AppImage magic, ELF architecture, and payload offset", () => {
  const header = makeType2AppImageHeader();
  assert.deepEqual(parseAppImageHeader(header), {
    type: 2,
    architecture: "x86_64",
    squashfsOffset: 192,
  });

  header[10] = 0;
  assert.equal(parseAppImageHeader(header), undefined);
});

test("parses safe AppImage desktop metadata", () => {
  const parsed = parseAppImageDesktopEntry([
    "[Desktop Entry]",
    "Type=Application",
    "Name=Example App",
    "Comment=Does useful things",
    "Icon=example-app",
    "X-AppImage-Version=1.2.3",
    "X-AppImage-Homepage=https://example.com",
    "Exec=ignored --unsafe=%U",
  ].join("\n"));
  assert.deepEqual(parsed, {
    name: "Example App",
    description: "Does useful things",
    iconName: "example-app",
    version: "1.2.3",
    homepage: "https://example.com/",
  });
});

test("generates a desktop entry with one safely quoted executable argument", () => {
  const entry = buildManagedDesktopEntry({
    name: "Cool App",
    description: "Local app",
    executablePath: "/home/test/Applications/My Cool `$ App.AppImage",
  });
  assert.match(entry, /^Exec="\/home\/test\/Applications\/My Cool \\`\\\$ App\.AppImage"$/m);
  assert.doesNotMatch(entry, /ignored|%U/);
  assert.equal(sanitizeManagedFileStem("../../- Weird / App\n"), "Weird App");
});

function makeType2AppImageHeader(): Buffer {
  const buffer = Buffer.alloc(196);
  buffer.set(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0x41, 0x49, 2, 0]));
  buffer.writeUInt16LE(62, 18);
  buffer.writeBigUInt64LE(128n, 40);
  buffer.writeUInt16LE(64, 58);
  buffer.writeUInt16LE(1, 60);
  buffer.write("hsqs", 192, "ascii");
  return buffer;
}
