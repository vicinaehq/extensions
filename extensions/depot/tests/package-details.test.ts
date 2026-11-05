import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwarePackage } from "../src/types.ts";
import {
  escapeMarkdown,
  packageDescriptionMarkdown,
  packageSourceLabel,
  safeHomepageUrl,
} from "../src/utils/package-details.ts";

test("allows only HTTP and HTTPS package homepages", () => {
  assert.equal(
    safeHomepageUrl("https://www.videolan.org/vlc/"),
    "https://www.videolan.org/vlc/",
  );
  assert.equal(safeHomepageUrl("http://example.com"), "http://example.com/");
  assert.equal(safeHomepageUrl("javascript:alert(1)"), undefined);
  assert.equal(safeHomepageUrl("file:///etc/passwd"), undefined);
  assert.equal(safeHomepageUrl("not a URL"), undefined);
  assert.equal(safeHomepageUrl(), undefined);
});

test("escapes package metadata before rendering it as markdown", () => {
  assert.equal(
    escapeMarkdown("[click](javascript:alert(1)) <tag>"),
    "\\[click\\]\\(javascript:alert\\(1\\)\\) \\<tag\\>",
  );
});

test("builds details from summary and long description", () => {
  const pkg: SoftwarePackage = {
    id: "vlc",
    name: "VLC",
    description: "Media *player*",
    longDescription: "Plays [many] formats.",
    source: "apt",
    installed: false,
  };

  assert.equal(
    packageDescriptionMarkdown(pkg),
    "Media \\*player\\*\n\nPlays \\[many\\] formats\\.",
  );
  assert.equal(packageSourceLabel(pkg), "APT");
  assert.equal(packageSourceLabel({
    ...pkg,
    id: "org.videolan.VLC",
    source: "flatpak",
    flatpak: { remote: "flathub", scope: "user" },
  }), "Flatpak · flathub");
});
