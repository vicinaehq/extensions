import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { accessSync, constants, openSync, readSync, closeSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { ProviderError } from "./types.ts";

const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p);

/** Folders searched for CLIs: extra PATH setting, PATH, then ~/.local/bin (Vicinae's service PATH lacks it). */
export function searchPath(extraPath?: string): string[] {
	const dirs = [...(extraPath ?? "").split(":"), ...(process.env.PATH ?? "").split(delimiter), "~/.local/bin"];
	return [...new Set(dirs.map((d) => d.trim()).filter(Boolean).map(expandHome))];
}

export function findBin(name: string, extraPath?: string): string | undefined {
	for (const dir of searchPath(extraPath)) {
		const file = join(dir, name);
		try {
			accessSync(file, constants.X_OK);
			return file;
		} catch {}
	}
}

/** Node scripts run with this process's Node, since `#!/usr/bin/env node` may not resolve. */
function isNodeScript(file: string): boolean {
	const real = realpathSync(file);
	if (/\.[cm]?js$/.test(real)) return true;
	const fd = openSync(real, "r");
	try {
		const head = Buffer.alloc(64);
		readSync(fd, head, 0, 64, 0);
		return /^#!.*\bnode\b/.test(head.toString("utf8").split("\n")[0]);
	} finally {
		closeSync(fd);
	}
}

/** Running CLIs. Vicinae can end the extension without unmounting it, so they are killed on exit too. */
const live = new Set<ChildProcessWithoutNullStreams>();
process.once("exit", () => {
	for (const child of live) child.kill("SIGKILL");
});

export type CliRun = {
	child: ChildProcessWithoutNullStreams;
	/** Resolves with stderr when the process exits 0; rejects otherwise. */
	done: Promise<string>;
};

/**
 * Starts a CLI in `cwd`, calls `onLine` per stdout line, kills it on abort or timeout.
 * `input`, when given, is written to stdin and stdin is closed.
 */
export function runCli(opts: {
	name: string;
	label: string;
	loginHint: string;
	args: string[];
	cwd: string;
	extraPath?: string;
	input?: string;
	keepStdinOpen?: boolean;
	signal: AbortSignal;
	timeoutMs?: number;
	onLine: (line: string) => void;
}): CliRun {
	const bin = findBin(opts.name, opts.extraPath);
	if (!bin) {
		throw new ProviderError(
			`Couldn't find \`${opts.name}\`. Install ${opts.label}, or add its folder under **Extra PATH** in Ask AI Settings (Ctrl+,).`,
		);
	}
	if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
	const [command, args] = isNodeScript(bin) ? [process.execPath, [bin, ...opts.args]] : [bin, opts.args];
	const env = { ...process.env, PATH: [dirname(bin), ...searchPath(opts.extraPath)].join(delimiter) };
	const child = spawn(command, args, { cwd: opts.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
	live.add(child);
	child.once("exit", () => live.delete(child));

	let stderr = "";
	child.stderr.on("data", (d) => {
		stderr = (stderr + d).slice(-4000);
	});
	createInterface({ input: child.stdout }).on("line", (line) => {
		if (line.trim()) opts.onLine(line);
	});
	child.stdin.on("error", () => {});
	if (opts.input !== undefined) child.stdin.write(opts.input);
	if (!opts.keepStdinOpen) child.stdin.end();

	let killed: "abort" | "timeout" | undefined;
	const kill = (why: "abort" | "timeout") => {
		killed ??= why;
		child.kill("SIGTERM");
		setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 2000).unref();
	};
	const onAbort = () => kill("abort");
	opts.signal.addEventListener("abort", onAbort, { once: true });
	const timer = setTimeout(() => kill("timeout"), opts.timeoutMs ?? 300_000);

	const done = new Promise<string>((resolve, reject) => {
		child.on("error", (err) => reject(new ProviderError(`Couldn't start \`${opts.name}\`: ${err.message}`)));
		child.on("close", (code) => {
			clearTimeout(timer);
			opts.signal.removeEventListener("abort", onAbort);
			if (killed === "abort") return reject(new DOMException("Aborted", "AbortError"));
			if (killed === "timeout") return reject(new ProviderError(`${opts.label} took longer than 5 minutes and was stopped.`));
			if (code === 0) return resolve(stderr);
			const tail = stderr.trim().split("\n").slice(-5).join("\n");
			reject(new ProviderError(`${opts.label} exited with code ${code}.${tail ? `\n\n\`\`\`\n${tail}\n\`\`\`` : ""}\n\n${opts.loginHint}`));
		});
	});
	return { child, done };
}
