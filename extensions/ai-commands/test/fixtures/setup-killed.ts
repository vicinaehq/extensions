import * as fs from "node:fs/promises";
import { configureLauncher } from "../../src/core/launcher-setup";
const options = JSON.parse(process.argv[2]!);
const stage = process.argv[3];
let states = 0;
function stop() {
  process.kill(process.pid, "SIGKILL");
}
void configureLauncher(options, {
  ...fs,
  rename: async (source, target) => {
    await fs.rename(source, target);
    const path = String(target);
    if (path.endsWith("/setup.json")) {
      states++;
      if (
        (stage === "pending" && states === 1) ||
        (stage === "complete" && states === 1)
      )
        stop();
    }
    if (stage === "app" && path.endsWith("/launch-app")) stop();
    if (stage === "settings" && path.endsWith("/settings.json")) stop();
    if (stage === "launcher" && path.endsWith("/vicinae")) stop();
  },
  link: async (source, target) => {
    await fs.link(source, target);
    if (stage === "pending" && String(target).endsWith("/setup.json")) stop();
    if (stage === "original" && String(target).endsWith("/vicinae-original"))
      stop();
    if (
      stage === "settings-backup" &&
      String(target).includes("/settings-before-setup-")
    )
      stop();
  },
  writeFile: async (path, data, options) => {
    if (
      (stage === "original-partial" &&
        String(data) === '#!/bin/sh\nexec /usr/bin/vicinae "$@"\n') ||
      (stage === "settings-partial" &&
        String(data).startsWith("{ // preserve me"))
    ) {
      await fs.writeFile(path, String(data).slice(0, 3), options);
      stop();
    }
    await fs.writeFile(path, data, options);
  },
});
