import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ZoxideEntry } from "./types";

const execFileAsync = promisify(execFile);

function buildPath(extraPath?: string): string {
    const parts: string[] = [];
    if (extraPath && extraPath.length > 0) parts.push(extraPath);
    parts.push(join(homedir(), ".local", "bin"));
    parts.push("/usr/local/bin");
    if (process.env.PATH) parts.push(process.env.PATH);
    return parts.join(":");
}

function buildEnv(extraPath?: string): NodeJS.ProcessEnv {
    return { ...process.env, PATH: buildPath(extraPath) };
}

async function run(cmd: string, args: string[], extraPath?: string): Promise<{ stdout: string; stderr: string }> {
    try {
        return await execFileAsync("zoxide", [cmd, ...args], { env: buildEnv(extraPath), maxBuffer: 32 * 1024 * 1024 });
    } catch (e) {
        const err = e as NodeJS.ErrnoException & { stderr?: string };
        const stderr = err.stderr ?? "";
        throw new Error(`zoxide ${cmd} failed: ${stderr || err.message}`);
    }
}

export async function queryAll(extraPath?: string): Promise<ZoxideEntry[]> {
    const { stdout } = await run("query", ["-ls"], extraPath);
    const entries: ZoxideEntry[] = [];
    const re = /^\s*(\d+\.\d+|\d+)\s+(.+?)\s*$/;
    for (const line of stdout.split("\n")) {
        const m = line.match(re);
        if (!m) continue;
        const score = parseFloat(m[1]);
        if (Number.isNaN(score)) continue;
        entries.push({ score, path: m[2] });
    }
    return entries;
}

export async function addPath(path: string, extraPath?: string): Promise<void> {
    await run("add", [path], extraPath);
}

export async function removePath(path: string, extraPath?: string): Promise<void> {
    await run("remove", [path], extraPath);
}
