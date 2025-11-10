import { execFile } from "child_process";
import { promisify } from "util";
import { Preferences } from "@/preferences";

const execFileAsync = promisify(execFile);

export class CommandError extends Error {
  constructor(
    message: string,
    public readonly code?: string | number,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export async function runCommand(command: string, args: string[], preferences: Preferences): Promise<string> {
  const env = buildEnv(preferences.additionalPath);

  try {
    const { stdout } = await execFileAsync(command, args, {
      env,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
    });
    return stdout;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    throw new CommandError(
      `Failed to run ${command}`,
      err.code,
      typeof err.stderr === "string" ? err.stderr : undefined,
    );
  }
}

function buildEnv(additionalPath?: string): NodeJS.ProcessEnv {
  const extras = additionalPath
    ?.split(":")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const currentPath = process.env.PATH ?? "";
  const updatedPath = extras && extras.length > 0 ? `${currentPath}:${extras.join(":")}` : currentPath;

  return {
    ...process.env,
    PATH: updatedPath,
  };
}
