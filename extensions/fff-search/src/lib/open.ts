import { spawn } from "node:child_process";
import { dirname } from "node:path";
import {
	closeMainWindow,
	open,
	runInTerminal,
	showToast,
	Toast,
} from "@vicinae/api";
import { loadPreferences } from "./preferences";

/** Splits a command line on whitespace, honoring single and double quotes. */
export function splitCommand(command: string): string[] {
	const args: string[] = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (const m of command.matchAll(re)) args.push(m[1] ?? m[2] ?? m[3]);
	return args;
}

export function editorArgs(
	command: string,
	file: string,
	line = 1,
	column = 1,
): string[] {
	const args = splitCommand(command);
	const fill = (arg: string) =>
		arg
			.replaceAll("{file}", file)
			.replaceAll("{line}", String(line))
			.replaceAll("{column}", String(column));

	const filled = args.map(fill);
	if (!args.some((a) => a.includes("{file}"))) filled.push(file);
	return filled;
}

const fail = (title: string, error: unknown) =>
	showToast({
		style: Toast.Style.Failure,
		title,
		message: error instanceof Error ? error.message : String(error),
	});

export async function openDefault(path: string) {
	try {
		await open(path);
		await closeMainWindow();
	} catch (e) {
		await fail("Failed to open file", e);
	}
}

export const hasEditor = () => loadPreferences().editorCommand !== "";

/** Opens in the configured editor at a position, or the default app if none. */
export async function openInEditor(path: string, line?: number, column?: number) {
	const { editorCommand, editorInTerminal } = loadPreferences();
	if (!editorCommand) return openDefault(path);

	const args = editorArgs(editorCommand, path, line, column);

	try {
		if (editorInTerminal) {
			await runInTerminal(args, { workingDirectory: dirname(path) });
		} else {
			await new Promise<void>((resolve, reject) => {
				// Windows editors are often .cmd shims (code.cmd), which only
				// start through the shell, so quote arguments for cmd.exe there.
				const windows = process.platform === "win32";
				const argv = windows
					? args.map((a) => (/[\s&|<>^]/.test(a) ? `"${a}"` : a))
					: args;
				const child = spawn(argv[0], argv.slice(1), {
					cwd: dirname(path),
					detached: !windows,
					shell: windows,
					windowsHide: true,
					stdio: "ignore",
				});
				child.once("error", reject);
				child.once("spawn", () => {
					child.unref();
					resolve();
				});
			});
		}
		await closeMainWindow();
	} catch (e) {
		await fail(`Failed to run ${args[0]}`, e);
	}
}

export async function openTerminalAt(directory: string) {
	try {
		const shell =
			process.platform === "win32"
				? process.env.COMSPEC || "cmd.exe"
				: process.env.SHELL || "/bin/sh";
		await runInTerminal([shell], {
			workingDirectory: directory,
		});
		await closeMainWindow();
	} catch (e) {
		await fail("Failed to open terminal", e);
	}
}
