import assert from "node:assert/strict";
import test from "node:test";
import {
  appStreamSearchTerm,
  enrichSoftwareItems,
  expandedSearchQueries,
  parseAppStreamSearchOutput,
} from "../src/backends/appstream-parsing.ts";
import type { SoftwareItem } from "../src/types.ts";

const OUTPUT = `Identifier: org.videolan.vlc [desktop-application]
Name: VLC
Summary: VLC media player, the open-source multimedia player
Package: vlc
Homepage: https://www.videolan.org/vlc/
Icon: vlc_vlc.png
---
Identifier: org.videolan.VLC.Plugin.bdj [addon]
Name: Bluray Java menus
Summary: Provides Bluray Java menus for VLC.
Bundle: flatpak:runtime/org.videolan.VLC.Plugin.bdj/x86_64/stable
---
Identifier: org.videolan.VLC [desktop-application]
Name: VLC
Summary:
  VLC media player, the open-source
  multimedia player
Bundle: flatpak:app/org.videolan.VLC/x86_64/stable
Homepage: https://www.videolan.org/vlc/
Icon: org.videolan.VLC.png
`;

test("parses repository applications and ignores Flatpak runtimes", () => {
  assert.deepEqual(parseAppStreamSearchOutput(OUTPUT), [
    {
      id: "org.videolan.vlc",
      kind: "desktop-application",
      name: "VLC",
      summary: "VLC media player, the open-source multimedia player",
      description: undefined,
      packageId: "vlc",
      flatpakId: undefined,
      homepage: "https://www.videolan.org/vlc/",
      categories: undefined,
      license: undefined,
      iconName: "vlc_vlc.png",
    },
    {
      id: "org.videolan.VLC",
      kind: "desktop-application",
      name: "VLC",
      summary: "VLC media player, the open-source multimedia player",
      description: undefined,
      packageId: undefined,
      flatpakId: "org.videolan.VLC",
      homepage: "https://www.videolan.org/vlc/",
      categories: undefined,
      license: undefined,
      iconName: "org.videolan.VLC.png",
    },
  ]);
});

test("parses richer AppStream details on demand", () => {
  const [component] = parseAppStreamSearchOutput(`Identifier: org.example.App [desktop-application]
Name: Example
Summary: Example application
Package: example
Description:
  A longer application description.
License: GPL-3.0-or-later
Categories:
  - Utility
  - Development
Provided Items: ↓
  Binaries: example
`);

  assert.equal(component?.description, "A longer application description.");
  assert.deepEqual(component?.categories, ["Utility", "Development"]);
  assert.equal(component?.license, "GPL-3.0-or-later");
});

test("rejects unsafe identifiers and icon paths", () => {
  const parsed = parseAppStreamSearchOutput(`Identifier: safe.desktop [desktop-application]
Name: Safe
Summary: Safe application
Package: safe-package
Icon: ../../tmp/payload.png
---
Identifier: ../../unsafe [desktop-application]
Name: Unsafe
Summary: Unsafe application
Package: unsafe-package
`);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.iconName, undefined);
});

test("enriches matching APT and Flatpak results without merging sources", () => {
  const components = parseAppStreamSearchOutput(OUTPUT).map((component) => ({
    ...component,
    iconPath: component.packageId ? "/icons/vlc.png" : "/icons/flatpak-vlc.png",
  }));
  const apt: SoftwareItem = {
    id: "vlc",
    name: "vlc",
    description: "multimedia player and streamer",
    source: "apt",
    installed: false,
  };
  const flatpak: SoftwareItem = {
    id: "org.videolan.VLC",
    name: "VLC",
    description: "Media player",
    source: "flatpak",
    installed: false,
    flatpak: { remote: "flathub", scope: "user" },
  };

  const enriched = enrichSoftwareItems([apt, flatpak], components);
  assert.deepEqual(enriched.map((pkg) => [pkg.source, pkg.name, pkg.icon]), [
    ["apt", "VLC", "/icons/vlc.png"],
    ["flatpak", "VLC", "/icons/flatpak-vlc.png"],
  ]);
  assert.equal(enriched[0]?.appstream?.isGuiApplication, true);
});

test("expands only documented generic aliases", () => {
  assert.equal(appStreamSearchTerm("vscode"), "Visual Studio Code");
  assert.equal(appStreamSearchTerm("OBS"), "OBS Studio");
  assert.equal(appStreamSearchTerm("vlc"), "vlc");
  assert.deepEqual(expandedSearchQueries("vscode"), [
    "vscode",
    "visual studio code",
  ]);
});
