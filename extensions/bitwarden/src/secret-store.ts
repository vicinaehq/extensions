import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { spawnWait } from './spawn-stdin';
import { logError } from './log';

const exec = promisify(execFile);

const SERVICE = 'vicinae-bitwarden';

function isNodeError(err: unknown): err is { code: string | number } & Error {
  return err instanceof Error && 'code' in err;
}

function isExpectedSecretMiss(err: unknown): boolean {
  if (!isNodeError(err)) return false;
  return err.code === 'ENOENT' || err.code === 1 || err.code === '1';
}

export async function secretLookup(account: string): Promise<string | null> {
  try {
    const { stdout } = await exec(
      'secret-tool',
      ['lookup', 'service', SERVICE, 'account', account],
      { timeout: 5000 },
    );
    const raw = stdout.trim();
    return raw || null;
  } catch (err) {
    if (!isExpectedSecretMiss(err)) logError('secret.lookup', err, { account });
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
  } catch (err) {
    if (!isExpectedSecretMiss(err)) logError('secret.clear', err, { account });
  }
}

let installed: boolean | null = null;

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
