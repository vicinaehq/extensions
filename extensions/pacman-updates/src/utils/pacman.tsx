import { exec } from "child_process";
import util from "util";
import { existsSync } from "fs";
import { access, stat } from "fs/promises";
import { constants } from "fs";
import path from "path";

const execp = util.promisify(exec);

export type Pkg = {
  name: string;
  current: string;
  available: string;
};

export async function fetchCheckupdates(): Promise<Pkg[]> {
  try {
    const { stdout: exists } = await execp(
      `bash -lc "command -v checkupdates || echo ''"`,
    );
    if (!exists.trim()) {
      throw new Error("checkupdates not found. Install pacman-contrib.");
    }
    const { stdout } = await execp(`bash -lc "checkupdates || true"`);
    const lines = stdout.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      // Parse "name current -> available"
      const arrowIdx = line.indexOf("->");
      if (arrowIdx === -1)
        return { name: line.trim(), current: "", available: "" };
      const left = line.slice(0, arrowIdx).trim(); // "name current"
      const right = line.slice(arrowIdx + 2).trim(); // "available"
      const parts = left.split(/\s+/);
      const name = parts.shift() ?? "";
      const current = parts.join(" ");
      const available = right;
      return { name, current, available };
    });
  } catch (e: any) {
    // If checkupdates is missing or another error occurred
    const msg =
      e?.stderr?.toString().trim() ||
      e?.stdout?.toString().trim() ||
      e?.message ||
      "Unknown error";
    throw new Error(msg);
  }
}

export const toggleVicinae = (): void => {
  exec(`vicinae vicinae://toggle`);
};

export async function scriptIsExecutable(p: string): Promise<boolean> {
  try {
    const resolved = p.startsWith("~")
      ? path.join(process.env.HOME || "", p.slice(1))
      : p;

    const abs = path.isAbsolute(resolved) ? resolved : path.resolve(resolved);
    const s = await stat(abs);

    if (!s.isFile()) return false;
    await access(abs, constants.F_OK | constants.X_OK);
    return true;
  } catch (e) {
    console.error("scriptIsExecutable failed:", e);
    return false;
  }
}
