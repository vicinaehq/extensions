// Read-only checks against the host. This never installs, removes or updates software.
import assert from "node:assert/strict";
import { searchPacman, pacmanDetails, pacmanPlan } from "../src/lib/pacman";
import { installed, sources, updates, details } from "../src/lib/catalog";
import { addonStores, installedAddons } from "../src/lib/plasma";
import { resolve } from "node:path";

async function main() {
  const results = await searchPacman("firefox");
  const firefox = results.find((x) => x.name === "firefox");
  assert.ok(firefox);
  assert.equal(firefox.source, "cachyos-extra-v4");
  const info = await pacmanDetails(firefox);
  assert.ok(info.details?.Name);
  const enriched = await details(firefox, resolve("assets"));
  assert.equal(enriched.title, "Firefox");
  const plan = await pacmanPlan(firefox, "install");
  assert.equal(plan.commands[0].args.includes("-Syu"), true);
  const [apps, repos, newer] = await Promise.all([installed("all"), sources(), updates()]);
  assert.ok(apps.items.length > 0);
  assert.ok(repos.items.length > 0);
  assert.deepEqual(apps.warnings, []);
  assert.deepEqual(repos.warnings, []);
  assert.deepEqual(newer.warnings, []);
  console.log(
    JSON.stringify(
      {
        search: results.length,
        installed: apps.items.length,
        sources: repos.items.length,
        updates: newer.items.length,
        plasmaStores: addonStores().length,
        plasmaPackages: installedAddons().length,
        appstream: enriched.title,
        packageChangesPerformed: 0,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
