import { spawn, execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { access } from "node:fs/promises";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import type { Preferences, RecentProject } from "./types";
import { WindowPreference } from "./types";
import { ZED_EXECUTABLE } from "./constants";

const KNOWN_ZED_PATHS = [
    join(homedir(), ".local", "bin", "zed"),
    "/usr/bin/zed",
    "/usr/local/bin/zed",
    "/usr/bin/zeditor",
    "/usr/local/bin/zeditor",
    "/usr/bin/zedit",
    "/usr/local/bin/zedit",
    join(homedir(), ".local", "zed.app", "bin", "zed"),
]; // See https://zed.dev/docs/linux#community for possible binary names

export async function openProject(project: RecentProject): Promise<void> {
    const resolvedPath = await resolveExecutable();
    if (!resolvedPath) {
        await showToast({
            style: Toast.Style.Failure,
            title: "Zed not found",
            message: `Make sure '${ZED_EXECUTABLE}' is available in your PATH.`,
        });
        return;
    }

    const { windowPreference } = getPreferenceValues<Preferences>();
    const args: string[] = [];

    if (windowPreference === WindowPreference.NewWindow) {
        args.push("--new");
    } else if (windowPreference === WindowPreference.AddToWindow) {
        args.push("--add");
    }

    args.push(project.path);

    try {
        await spawnDetached(resolvedPath, args);
    } catch (error) {
        await showToast({
            style: Toast.Style.Failure,
            title: "Failed to open project",
            message: `Could not open project in Zed: ${error}`,
        });
    }
}

async function resolveExecutable(): Promise<string | undefined> {
    // Try known paths first
    for (const p of KNOWN_ZED_PATHS) {
        try {
            await access(p);
            return p;
        } catch {}
    }
    // Fall back to shell resolution
    try {
        const result = await execInShell(`command -v ${ZED_EXECUTABLE}`);
        const resolved = result.trim();
        if (resolved) return resolved;
    } catch {}
    return undefined;
}

function execInShell(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile("/bin/sh", ["-lc", cmd], (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });
}

function spawnDetached(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const { NODE_ENV, ...env } = process.env;
        const child = spawn(cmd, args, {
            detached: true,
            stdio: "ignore",
            env,
        });
        child.once("error", reject);
        child.once("spawn", () => {
            child.unref();
            resolve();
        });
    });
}
