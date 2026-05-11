import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { spawnWait } from './spawn-stdin';

const exec = promisify(execFile);

const SERVICE = 'vicinae-bitwarden';

export async function secretLookup(account: string): Promise<string | null> {
  try {
    const { stdout } = await exec(
      'secret-tool',
      ['lookup', 'service', SERVICE, 'account', account],
      { timeout: 5000 },
    );
    const raw = stdout.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export async function secretStore(account: string, data: string, label: string): Promise<void> {
  await spawnWait(
    'secret-tool',
    ['store', `--label=${label}`, 'service', SERVICE, 'account', account],
    data,
  );
}

export async function secretClear(account: string): Promise<void> {
  try {
    await exec('secret-tool', ['clear', 'service', SERVICE, 'account', account], {
      timeout: 5000,
    });
  } catch {
    // Non-fatal
  }
}

let installed: boolean | null = null;

function isNodeError(err: unknown): err is { code: string } & Error {
  return err instanceof Error && 'code' in err;
}

export async function checkSecretToolInstalled(): Promise<boolean> {
  if (installed !== null) return installed;
  try {
    await exec('secret-tool', ['lookup', 'service', SERVICE, 'account', 'session'], {
      timeout: 5000,
    });
    installed = true;
    return true;
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      installed = false;
      return false;
    }
    installed = true;
    return true;
  }
}
