import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BwError, BwFolder, BwItem, ItemType, ItemTypeValue } from './bitwarden-types';

const exec = promisify(execFile);

/** Token that identifies an unlocked vault session */
export type Session = string;

interface BwStatus {
  serverUrl: string | null;
  lastSync: string | null;
  userEmail: string;
  userId: string;
  status: 'unauthenticated' | 'locked' | 'unlocked';
}

function parseJson<T>(stdout: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new BwError('Failed to parse `bw` output as JSON', 'PARSE_ERROR');
  }
}

function sessionEnv(session: Session): NodeJS.ProcessEnv {
  return { ...process.env, BW_SESSION: session };
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toBwError(err: unknown): BwError {
  if (err instanceof BwError) return err;
  return new BwError(getErrorMessage(err), 'CLI_ERROR');
}

/**
 * Check whether the `bw` binary is installed and on PATH.
 */
export async function checkInstalled(): Promise<boolean> {
  try {
    await exec('bw', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Login to a Bitwarden Server using an API key.
 * Must be called once before any Unlock.
 * Sets the server URL for self-hosted instances before login.
 */
export async function login(params: {
  clientId: string;
  clientSecret: string;
  serverUrl: string;
}): Promise<void> {
  const env = {
    ...process.env,
    BW_CLIENTID: params.clientId,
    BW_CLIENTSECRET: params.clientSecret,
  };

  try {
    await exec('bw', ['config', 'server', params.serverUrl], {
      timeout: 10000,
      env,
    });
  } catch (err) {
    throw toBwError(err);
  }

  try {
    await exec('bw', ['login', '--apikey'], {
      timeout: 30000,
      env,
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Retrieve the current status of the `bw` CLI (unauthenticated / locked / unlocked).
 */
export async function status(): Promise<BwStatus> {
  try {
    const { stdout } = await exec('bw', ['status'], { timeout: 10000 });
    return parseJson<BwStatus>(stdout);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Unlock the vault using the master password.
 * Returns the Session token.
 */
export async function unlock(masterPassword: string): Promise<Session> {
  try {
    const { stdout } = await exec('bw', ['unlock', masterPassword, '--raw'], {
      timeout: 15000,
    });
    return stdout.trim();
  } catch (err) {
    const bwErr = toBwError(err);
    if (
      bwErr.message.toLowerCase().includes('invalid') ||
      bwErr.message.toLowerCase().includes('password')
    ) {
      throw new BwError('Invalid master password', 'INVALID_PASSWORD');
    }
    throw bwErr;
  }
}

/**
 * Pull the latest vault state from the Server.
 * Requires a valid Session.
 */
export async function sync(session: Session): Promise<void> {
  try {
    await exec('bw', ['sync'], { timeout: 30000, env: sessionEnv(session) });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * List all Items in the vault.
 * Requires a valid Session.
 */
export async function listItems(session: Session): Promise<BwItem[]> {
  try {
    const { stdout } = await exec('bw', ['list', 'items'], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      env: sessionEnv(session),
    });
    return parseJson<BwItem[]>(stdout);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * List all Folders in the vault.
 * Requires a valid Session.
 */
export async function listFolders(session: Session): Promise<BwFolder[]> {
  try {
    const { stdout } = await exec('bw', ['list', 'folders'], {
      timeout: 15000,
      env: sessionEnv(session),
    });
    return parseJson<BwFolder[]>(stdout);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Get a single Item by ID with full details (including password).
 * Requires a valid Session.
 */
export async function getItem(id: string, session: Session): Promise<BwItem> {
  try {
    const { stdout } = await exec('bw', ['get', 'item', id], {
      timeout: 15000,
      env: sessionEnv(session),
    });
    return parseJson<BwItem>(stdout);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Get a TOTP code for a Login item.
 * Requires a valid Session.
 */
export async function getTotp(id: string, session: Session): Promise<string> {
  try {
    const { stdout } = await exec('bw', ['get', 'totp', id], {
      timeout: 10000,
      env: sessionEnv(session),
    });
    return stdout.trim();
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Create a new Item in the vault.
 * Requires a valid Session. The `payload` is the full JSON object
 * matching Bitwarden's internal item schema.
 */
export async function createItem(payload: CreateItemPayload, session: Session): Promise<void> {
  const json = JSON.stringify(payload);
  try {
    await exec('bw', ['create', 'item', json], {
      timeout: 15000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Edit an existing Item in the vault.
 * Requires a valid Session. The `payload` is a partial item JSON
 * with only the fields to update.
 */
export async function editItem(id: string, payload: object, session: Session): Promise<void> {
  const json = JSON.stringify(payload);
  try {
    await exec('bw', ['edit', 'item', id, json], {
      timeout: 15000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Create a new Folder in the vault.
 * Requires a valid Session. Returns the created folder with its id.
 */
export async function createFolder(name: string, session: Session): Promise<BwFolder> {
  const json = JSON.stringify({ name });
  try {
    const { stdout } = await exec('bw', ['create', 'folder', json], {
      timeout: 15000,
      env: sessionEnv(session),
    });
    return parseJson<BwFolder>(stdout);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Delete an Item from the vault by ID.
 * Requires a valid Session.
 */
export async function deleteItem(id: string, session: Session): Promise<void> {
  try {
    await exec('bw', ['delete', 'item', id], {
      timeout: 15000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Log out of Bitwarden, clearing the stored API key login state.
 */
export async function logout(): Promise<void> {
  try {
    await exec('bw', ['logout'], { timeout: 10000 });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Lock the vault, invalidating the current Session.
 */
export async function lock(session: Session): Promise<void> {
  try {
    await exec('bw', ['lock'], { timeout: 10000, env: sessionEnv(session) });
  } catch {
    // Lock failures are non-fatal — the session is cleared client-side regardless
  }
}

/**
 * Generate a random password using the `bw generate` command.
 * No session required — this is a local cryptographic operation.
 */
export async function generatePassword(options: {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}): Promise<string> {
  const flags: string[] = [];
  if (options.uppercase) flags.push('-u');
  if (options.lowercase) flags.push('-l');
  if (options.numbers) flags.push('-n');
  if (options.symbols) flags.push('-s');
  flags.push('--length', String(options.length));

  try {
    const { stdout } = await exec('bw', ['generate', ...flags], {
      timeout: 10000,
    });
    return stdout.trim();
  } catch (err) {
    throw toBwError(err);
  }
}

/** Descriptor for an action the user can take on an Item */
export interface ItemAction {
  label: string;
  value: string;
  icon?: string;
}

/** Payload passed to createItem() */
export interface CreateItemPayload {
  type: ItemTypeValue;
  name: string;
  notes: string | null;
  folderId: string | null;
  favorite: boolean;
  login?: {
    username: string | null;
    password: string | null;
    totp: string | null;
    uris?: { uri: string; match: null }[];
  };
  card?: {
    cardholderName: string | null;
    brand: string | null;
    number: string | null;
    expMonth: string | null;
    expYear: string | null;
    code: string | null;
  };
  identity?: {
    title: string | null;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  secureNote?: {
    type: number;
  };
  fields?: { name: string; value: string; type: number }[];
}
