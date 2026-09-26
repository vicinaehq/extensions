import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { showToast, Toast } from '@vicinae/api';

const execFileAsync = promisify(execFile);
let hyprctlCheckPromise: Promise<void> | undefined;

/**
 * Runs a hyprctl command and parses its JSON output.
 */
export async function getHyprctlJson<T>(command: string): Promise<T> {
  await ensureHyprRuntimeAvailable();
  const args = ['-j', ...command.split(' ').filter(Boolean)];
  const { stdout } = await execFileAsync('hyprctl', args, {
    timeout: 10000,
  }).catch((error: unknown) => {
    throw normalizeHyprError(error);
  });

  return JSON.parse(stdout) as T;
}

/**
 * Runs hyprctl with the given arguments and rejects textual command errors.
 */
export async function runHyprctlCommand(args: string[]) {
  const { stdout } = await execFileAsync('hyprctl', args, {
    timeout: 10000,
  });

  ensureHyprctlCommandSucceeded(stdout);
}

/**
 * Verifies that the current environment can communicate with Hyprland.
 */
export async function ensureHyprRuntimeAvailable() {
  ensureHyprlandSession();
  await ensureHyprctlAvailable();
}

/**
 * Logs an error and displays a normalized failure toast.
 */
export function handleError(title: string, error: unknown) {
  console.error(error);
  const normalizedError = normalizeHyprError(error);

  showToast({
    style: Toast.Style.Failure,
    title,
    message: normalizedError.message,
  });
}

/**
 * Throws when the extension is not running inside a Hyprland session.
 */
function ensureHyprlandSession() {
  if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
    return;
  }

  throw new Error('This extension only works in a Hyprland session.');
}

/**
 * Checks that the hyprctl executable and Hyprland IPC are available.
 */
async function ensureHyprctlAvailable() {
  hyprctlCheckPromise ??= execFileAsync('hyprctl', ['version'], {
    timeout: 10000,
  })
    .then(() => undefined)
    .catch((error: unknown) => {
      hyprctlCheckPromise = undefined;
      throw normalizeHyprError(error);
    });

  await hyprctlCheckPromise;
}

/**
 * Converts process and Hyprland errors into user-facing error messages.
 */
function normalizeHyprError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error('Unknown error');
  }

  const execError = error as Error & {
    code?: string | number;
    stdout?: string;
    stderr?: string;
  };
  const combinedOutput = [execError.message, execError.stderr, execError.stdout]
    .filter(Boolean)
    .join('\n');

  if (execError.code === 'ENOENT') {
    return new Error(
      'hyprctl is required. Install Hyprland/hyprctl and try again.'
    );
  }

  if (isMissingHyprlandSessionError(combinedOutput)) {
    return new Error('This extension only works in a Hyprland session.');
  }

  if (isUnavailableHyprlandIpcError(combinedOutput)) {
    return new Error(
      'Hyprland IPC is unavailable. Make sure Hyprland is running and try again.'
    );
  }

  return error;
}

/**
 * Detects errors caused by a missing Hyprland session environment variable.
 */
function isMissingHyprlandSessionError(message: string) {
  return /HYPRLAND_INSTANCE_SIGNATURE/u.test(message);
}

/**
 * Detects errors indicating that Hyprland IPC cannot be reached.
 */
function isUnavailableHyprlandIpcError(message: string) {
  return /(instance signature|socket|ipc|connection|connect|broken pipe)/iu.test(
    message
  );
}

/**
 * Throws when hyprctl reports an error in otherwise successful output.
 */
function ensureHyprctlCommandSucceeded(stdout: string) {
  const output = stdout.trim();

  if (output.startsWith('error:')) {
    throw new Error(output);
  }
}
