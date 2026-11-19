import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwareItem } from "../src/types.ts";
import {
  escapeMarkdown,
  fencedTextBlock,
  packageDescriptionMarkdown,
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
  const pkg: SoftwareItem = {
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
});

test("renders multi-line output in a fence it cannot close", () => {
  const block = fencedTextBlock("E: first line\n```\n# injected `code`");

  assert.equal(
    block,
    "```text\nE: first line\n`\u200b`\u200b`\n# injected `code`\n```",
  );
  assert.equal(block.split("\n").filter((line) => line.startsWith("```")).length, 2);
});

test("escapes math and strikethrough markers in package descriptions", () => {
  assert.equal(
    escapeMarkdown("Photoshop $.psd$ ~~old~~"),
    "Photoshop \\$\\.psd\\$ \\~\\~old\\~\\~",
  );
});
