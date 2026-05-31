import { execFileSync, spawn } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { ghosttyBin, type Preferences } from "./lib";

function focusGhosttyWithKWin(): void {
  const scriptPath = join(tmpdir(), `vicinae-focus-ghostty-${process.pid}.js`);
  writeFileSync(scriptPath, `
function windows() {
  if (typeof workspace.windowList === 'function') return workspace.windowList();
  if (typeof workspace.clientList === 'function') return workspace.clientList();
  return [];
}
for (const w of windows()) {
  const klass = String(w.resourceClass || w.resourceName || w.windowClass || '').toLowerCase();
  const cap = String(w.caption || '').toLowerCase();
  if (klass.includes('ghostty') || cap.includes('ghostty')) {
    workspace.activeWindow = w;
    break;
  }
}
`);
  execFileSync("qdbus", ["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadScript", scriptPath, `vicinae-focus-ghostty-${process.pid}`], { timeout: 2000 });
  execFileSync("qdbus", ["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.start"], { timeout: 2000 });
}

function sendNewTabShortcut(): boolean {
  const socket = `/run/user/${process.getuid?.() ?? 1000}/.ydotool_socket`;
  if (!existsSync(socket)) return false;
  execFileSync("ydotool", ["key", "29:1", "42:1", "20:1", "20:0", "42:0", "29:0"], {
    env: { ...process.env, YDOTOOL_SOCKET: socket },
    timeout: 3000,
    stdio: "ignore",
  });
  return true;
}

export default async function Command() {
  try {
    focusGhosttyWithKWin();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    sendNewTabShortcut();
  } catch (e: any) {
    try {
      const bin = ghosttyBin(getPreferenceValues<Preferences>());
      const child = spawn(bin, [], { detached: true, stdio: "ignore", cwd: process.env.HOME || undefined });
      child.unref();
      await showToast({ style: Toast.Style.Failure, title: "Could not send new-tab shortcut", message: "Opened Ghostty instead. Check qdbus, KWin scripting, and ydotool." });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Could not create Ghostty tab", message: e?.message || String(e) });
    }
  }
}
