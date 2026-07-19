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
    "/run/current-system/sw/bin/zeditor",
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

    try {
        const uri = buildUri(project);
        args.push(uri);
    } catch (error) {
        await showToast({
            style: Toast.Style.Failure,
            title: "Failed to build URI",
            message: `Could not build URI for project: ${error}`,
        });
        return;
    }

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

function buildUri(project: RecentProject): string {
    if (!project.remote) {
        const uri = new URL("file:///");
        uri.pathname = project.path;
        return uri.toString();
    }

    if (!project.remote.host) {
        throw new Error("Remote host is missing");
    }

    const isRawIpv6 = project.remote.host.includes(":") && !project.remote.host.startsWith("[");
    const safeHost = isRawIpv6 ? `[${project.remote.host}]` : project.remote.host;
    const uri = new URL(`${project.remote.kind}://${safeHost}`);
    uri.pathname = project.path;

    if (project.remote.user) {
        uri.username = project.remote.user;
    }
    if (project.remote.port) {
        uri.port = project.remote.port.toString();
    }

    return uri.toString();
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
