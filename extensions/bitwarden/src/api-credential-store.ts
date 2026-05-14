import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { secretStore, secretLookup, secretClear } from './secret-store';
import { safeJsonParse } from './json-utils';
import { logError } from './log';

const exec = promisify(execFile);

const ACCOUNT = 'api-creds';

function getHome(): string {
  const home = process.env.HOME;
  if (!home) throw new Error('HOME environment variable is not set');
  return home;
}

export async function storeApiCredentials(clientId: string, clientSecret: string): Promise<void> {
  await secretStore(
    ACCOUNT,
    JSON.stringify({ clientId, clientSecret }),
    'Vicinae Bitwarden API Key',
  );
}

function parseJsonRecord(raw: string): { clientId: string; clientSecret: string } | null {
  return safeJsonParse<{ clientId: string; clientSecret: string }>(raw, {
    strings: ['clientId', 'clientSecret'],
  });
}

export async function getApiCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  try {
    const raw = await secretLookup(ACCOUNT);
    if (!raw) return null;
    return parseJsonRecord(raw);
  } catch (err) {
    logError('apiCreds.lookup', err);
    return null;
  }
}

async function deleteApiCredentials(): Promise<void> {
  await secretClear(ACCOUNT);
}

export async function clearApiCredentialsFromDisk(): Promise<void> {
  try {
    const settingsPath = join(getHome(), '.config', 'vicinae', 'settings.json');
    const content = readFileSync(settingsPath, 'utf-8');
    let updated = content.replace(
      /"bitwardenApiClientId"\s*:\s*"[^"]*"/,
      '"bitwardenApiClientId": ""',
    );
    updated = updated.replace(
      /"bitwardenApiClientSecret"\s*:\s*"[^"]*"/,
      '"bitwardenApiClientSecret": ""',
    );
    if (updated !== content) {
      writeFileSync(settingsPath, updated, 'utf-8');
    }
  } catch (err) {
    logError('apiCreds.clearSettings', err);
  }

  try {
    const dbPath = join(getHome(), '.local', 'share', 'vicinae', 'vicinae.db');
    const db = new Database(dbPath);
    db.prepare(
      "DELETE FROM storage_data_item WHERE key IN ('bitwardenApiClientId', 'bitwardenApiClientSecret')",
    ).run();
    db.close();
  } catch (err) {
    logError('apiCreds.clearDb', err);
  }
}
