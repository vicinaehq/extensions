import assert from "node:assert/strict";
import test from "node:test";
import {
  PACKAGE_EXTENSIONS,
  hasExtension,
  searchIndexedFiles,
} from "../src/local-packages/search.ts";

test("finds package files with extension-qualified partial-name searches", async () => {
  const queries: string[] = [];
  const result = await searchIndexedFiles(
    "spotif",
    PACKAGE_EXTENSIONS,
    (query) => {
      queries.push(query);
      if (query.endsWith(".deb")) {
        return Promise.resolve([
          { path: "/home/user/Downloads/spotifast_0.12.0_amd64.deb" },
          { path: "/home/user/.config/spotifast/settings.json" },
        ]);
      }
      return Promise.resolve([]);
    },
    40,
  );

  assert.deepEqual(queries, [
    "spotif",
    "spotif .deb",
    "spotif .flatpak",
    "spotif .flatpakref",
    "spotif .appimage",
  ]);
  assert.deepEqual(result, [
    { path: "/home/user/Downloads/spotifast_0.12.0_amd64.deb" },
  ]);
});

test("keeps the single-query fast path when it finds a package", async () => {
  const queries: string[] = [];
  const result = await searchIndexedFiles(
    "spotifast_0.12.0_amd64.deb",
    PACKAGE_EXTENSIONS,
    (query) => {
      queries.push(query);
      return Promise.resolve([
        { path: "/home/user/Downloads/spotifast_0.12.0_amd64.deb" },
      ]);
    },
    40,
  );

  assert.deepEqual(queries, ["spotifast_0.12.0_amd64.deb"]);
  assert.equal(result.length, 1);
});

test("recognizes listed extensions case-insensitively", () => {
  assert.equal(hasExtension("/tmp/example.deb", PACKAGE_EXTENSIONS), true);
  assert.equal(hasExtension("/tmp/example.flatpak", PACKAGE_EXTENSIONS), true);
  assert.equal(hasExtension("/tmp/example.flatpakref", PACKAGE_EXTENSIONS), true);
  assert.equal(hasExtension("/tmp/example.AppImage", PACKAGE_EXTENSIONS), true);
  assert.equal(hasExtension("/tmp/example.json", PACKAGE_EXTENSIONS), false);
  assert.equal(hasExtension("/tmp/Profile.JSON", [".json"]), true);
});

test("generalizes the per-extension fallback to profile searches", async () => {
  const queries: string[] = [];
  const result = await searchIndexedFiles(
    "laptop",
    [".json"],
    (query) => {
      queries.push(query);
      return Promise.resolve(query.endsWith(".json")
        ? [{ path: "/home/user/laptop-profile.json" }, { path: "/home/user/laptop.txt" }]
        : []);
    },
    60,
  );
  assert.deepEqual(queries, ["laptop", "laptop .json"]);
  assert.deepEqual(result, [{ path: "/home/user/laptop-profile.json" }]);
});
