import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type VaultEntry = {
  id: string;
  name: string;
  user: string | null;
  folder: string | null;
  uris: string[];
  type: string;
};

export class RbwError extends Error {
  constructor(
    message: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "RbwError";
  }
}

async function runRbw(
  args: string[],
  options?: { timeout?: number },
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("rbw", args, {
      maxBuffer: 4 * 1024 * 1024,
      encoding: "utf-8",
      timeout: options?.timeout ?? 15_000,
    });
    return stdout;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    throw new RbwError(
      `rbw command failed: ${err.message}`,
      typeof err.stderr === "string" ? err.stderr : undefined,
    );
  }
}

/** Check if the vault is currently unlocked. */
export async function isUnlocked(): Promise<boolean> {
  try {
    await runRbw(["unlocked"]);
    return true;
  } catch {
    return false;
  }
}

/** List all vault entries. */
export async function listEntries(): Promise<VaultEntry[]> {
  const stdout = await runRbw(["list", "--raw"]);
  return JSON.parse(stdout) as VaultEntry[];
}

/** Search vault entries by term. */
export async function searchEntries(term: string): Promise<VaultEntry[]> {
  const stdout = await runRbw(["search", "--raw", term]);
  return JSON.parse(stdout) as VaultEntry[];
}

/** Get a specific field from an entry. */
export async function getField(
  field: string,
  name: string,
  user?: string,
): Promise<string> {
  const args = ["get", "--field", field, name];
  if (user) args.push(user);
  return (await runRbw(args)).trimEnd();
}

/** List available fields for an entry. */
export async function listFields(
  name: string,
  user?: string,
): Promise<string[]> {
  const args = ["get", "--list-fields", name];
  if (user) args.push(user);
  const stdout = await runRbw(args);
  return stdout.trim().split("\n");
}

/** Get the current TOTP code for an entry. */
export async function getCode(name: string, user?: string): Promise<string> {
  const args = ["code", name];
  if (user) args.push(user);
  return (await runRbw(args)).trimEnd();
}

/** Sync the vault with the Bitwarden server. */
export async function syncVault(): Promise<void> {
  await runRbw(["sync"], { timeout: 60_000 });
}
