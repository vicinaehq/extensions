import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TERMINAL_CHAIN = [
    "kitty",
    "alacritty",
    "wezterm",
    "foot",
    "ghostty",
    "gnome-terminal",
    "konsole",
    "xterm",
    "xdg-terminal-exec",
];

function buildPath(extraPath?: string): string {
    const parts: string[] = [];
    if (extraPath && extraPath.length > 0) parts.push(extraPath);
    parts.push(join(homedir(), ".local", "bin"));
    parts.push("/usr/local/bin");
    if (process.env.PATH) parts.push(process.env.PATH);
    return parts.join(":");
}

function findInPath(name: string, extraPath?: string): boolean {
    const candidates = [`/usr/bin/${name}`, `/usr/local/bin/${name}`, join(homedir(), ".local", "bin", name)];
    if (extraPath) {
        for (const dir of extraPath.split(":")) {
            if (dir.length > 0) candidates.push(join(dir, name));
        }
    }
    for (const c of candidates) {
        if (existsSync(c)) return true;
    }
    const r = spawnSync("which", [name], { env: { ...process.env, PATH: buildPath(extraPath) } });
    return r.status === 0;
}

export function detectTerminal(extraPath?: string): string {
    for (const name of TERMINAL_CHAIN) {
        if (findInPath(name, extraPath)) return name;
    }
    return "xterm";
}

export function spawnDetached(cmd: string, opts: { cwd?: string; args?: string[]; extraPath?: string }): void {
    const env = { ...process.env, PATH: buildPath(opts.extraPath) };
    try {
        const child = spawn(cmd, opts.args ?? [], {
            cwd: opts.cwd,
            env,
            detached: true,
            stdio: "ignore",
        });
        child.on("error", () => {});
        child.unref();
    } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
            throw new Error(`Command '${cmd}' not found in PATH`);
        }
        throw err;
    }
}
