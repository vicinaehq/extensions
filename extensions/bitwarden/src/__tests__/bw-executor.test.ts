import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as bw from '../bw-executor';
import { mockExec, mockExecError, expectEncodeAndExec } from './__utils__/exec-mocks';

const mockExecFile = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());
const { mockPrefs } = vi.hoisted(() => ({
  mockPrefs: {
    serverRegion: 'bitwarden.com' as const,
    customServerUrl: '',
    customCertPath: '',
    bitwardenApiClientId: '',
    bitwardenApiClientSecret: '',
    autoLockTimeout: '21600',
    downloadDir: '',
    passwordLength: '20',
    passwordUppercase: true,
    passwordLowercase: true,
    passwordNumbers: true,
    passwordSymbols: true,
  },
}));

// fallow-ignore-next-line code-duplication
vi.mock('node:child_process', () => ({
  default: { execFile: mockExecFile, spawn: mockSpawn },
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

// fallow-ignore-next-line code-duplication
vi.mock('node:util', () => ({
  default: { promisify: (fn: unknown) => fn },
  promisify: (fn: unknown) => fn,
}));

vi.mock('@vicinae/api', () => ({
  getPreferenceValues: () => mockPrefs,
}));

function spawnMockChild(stdout: string, exitCode = 0) {
  const child = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
    on: vi.fn(),
  };
  child.stdout.on.mockImplementation((event: string, cb: (d: Buffer) => void) => {
    if (event === 'data') cb(Buffer.from(stdout));
    return child;
  });
  child.stderr.on.mockImplementation((event: string, cb: (d: Buffer) => void) => {
    if (event === 'data' && exitCode !== 0) cb(Buffer.from(stdout));
    return child;
  });
  child.stdin.on.mockReturnValue(child);
  child.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'close') cb(exitCode);
    return child;
  });
  mockSpawn.mockReturnValueOnce(child);
  return child;
}

const hasSession = (token: string) =>
  expect.objectContaining({ env: expect.objectContaining({ BW_SESSION: token }) });

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// checkInstalled
// ---------------------------------------------------------------------------
describe('checkInstalled', () => {
  it('returns true when bw --version succeeds', async () => {
    mockExec(mockExecFile, 'Bitwarden CLI v2024.1.0');
    expect(await bw.checkInstalled()).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['--version'], expect.any(Object));
  });

  it('returns false when bw --version fails', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('not found'));
    expect(await bw.checkInstalled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
describe('login', () => {
  const params = {
    clientId: 'user.123',
    clientSecret: 'secret',
    serverUrl: 'https://bitwarden.com',
  };

  it('calls bw config server then bw login --apikey with env vars', async () => {
    mockExec(mockExecFile, '');
    mockExec(mockExecFile, '');

    await bw.login(params);

    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(mockExecFile).toHaveBeenNthCalledWith(
      1,
      'bw',
      ['config', 'server', 'https://bitwarden.com'],
      expect.objectContaining({
        env: expect.objectContaining({ BW_CLIENTID: 'user.123', BW_CLIENTSECRET: 'secret' }),
      }),
    );
    expect(mockExecFile).toHaveBeenNthCalledWith(
      2,
      'bw',
      ['login', '--apikey'],
      expect.objectContaining({ env: expect.objectContaining({ BW_CLIENTID: 'user.123' }) }),
    );
  });

  it('throws BwError when config server fails', async () => {
    mockExecError(mockExecFile, 'Network error');

    await expect(bw.login(params)).rejects.toThrow('Network error');
  });
});

// ---------------------------------------------------------------------------
// unlock
// ---------------------------------------------------------------------------
describe('unlock', () => {
  it('calls bw unlock --passwordenv BW_PASSWORD --raw and returns session', async () => {
    mockExec(mockExecFile, 'session-token-abc\n');

    const sessionToken = await bw.unlock('mypassword');
    expect(sessionToken).toBe('session-token-abc');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['unlock', '--passwordenv', 'BW_PASSWORD', '--raw'],
      expect.objectContaining({
        env: expect.objectContaining({ BW_PASSWORD: 'mypassword' }),
      }),
    );
  });

  it('throws BwError with INVALID_PASSWORD for invalid password', async () => {
    mockExecError(mockExecFile, 'Invalid master password');

    await expect(bw.unlock('wrong')).rejects.toMatchObject({
      message: 'Invalid master password',
      code: 'INVALID_PASSWORD',
    });
  });

  it('throws generic BwError for other unlock errors', async () => {
    mockExecError(mockExecFile, 'Network timeout');

    await expect(bw.unlock('pass')).rejects.toMatchObject({
      message: 'Network timeout',
      code: 'CLI_ERROR',
    });
  });
});

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------
describe('sync', () => {
  it('calls bw sync with BW_SESSION env var', async () => {
    mockExec(mockExecFile, '');

    await bw.sync('token-abc');
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['sync'], hasSession('token-abc'));
  });

  it('throws BwError on sync failure', async () => {
    mockExecError(mockExecFile, 'Sync failed');

    await expect(bw.sync('token')).rejects.toThrow('Sync failed');
  });
});

// ---------------------------------------------------------------------------
// listItems
// ---------------------------------------------------------------------------
describe('listItems', () => {
  it('calls bw list items with BW_SESSION and parses JSON', async () => {
    const items = [{ id: '1', name: 'GitHub', type: 1 }];
    mockExec(mockExecFile, JSON.stringify(items));

    const result = await bw.listItems('token-abc');
    expect(result).toEqual(items);
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['list', 'items'], hasSession('token-abc'));
  });

  it('throws BwError when JSON parsing fails', async () => {
    mockExec(mockExecFile, 'not valid json {{{');

    await expect(bw.listItems('token')).rejects.toMatchObject({
      message: 'Failed to parse `bw` output as JSON',
      code: 'PARSE_ERROR',
    });
  });
});

// ---------------------------------------------------------------------------
// listFolders
// ---------------------------------------------------------------------------
describe('listFolders', () => {
  it('calls bw list folders with BW_SESSION and parses JSON', async () => {
    const folders = [{ id: 'f1', name: 'Work' }];
    mockExec(mockExecFile, JSON.stringify(folders));

    const result = await bw.listFolders('token');
    expect(result).toEqual(folders);
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['list', 'folders'], hasSession('token'));
  });
});

// ---------------------------------------------------------------------------
// getItem
// ---------------------------------------------------------------------------
describe('getItem', () => {
  it('calls bw get item with BW_SESSION and returns parsed item', async () => {
    const itemObj = { id: '1', name: 'GitHub', type: 1 };
    mockExec(mockExecFile, JSON.stringify(itemObj));

    const result = await bw.getItem('1', 'token');
    expect(result).toEqual(itemObj);
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['get', 'item', '1'], hasSession('token'));
  });
});

// ---------------------------------------------------------------------------
// getTotp
// ---------------------------------------------------------------------------
describe('getTotp', () => {
  it('calls bw get totp with BW_SESSION and returns trimmed code', async () => {
    mockExec(mockExecFile, '123456\n');

    const code = await bw.getTotp('1', 'token');
    expect(code).toBe('123456');
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['get', 'totp', '1'], hasSession('token'));
  });
});

// ---------------------------------------------------------------------------
// createItem
// ---------------------------------------------------------------------------
describe('createItem', () => {
  it('encodes payload and creates item via bw encode + bw create item', async () => {
    const encoded = Buffer.from(JSON.stringify({ name: 'Test' })).toString('base64');
    spawnMockChild(encoded);
    spawnMockChild(
      '{"id":"abc","name":"Test","type":1,"notes":null,"folderId":null,"favorite":false,"revisionDate":"","creationDate":"","deletedDate":null,"collectionIds":null}',
    );

    const payload = {
      type: 1 as const,
      name: 'Test',
      notes: null,
      folderId: null,
      favorite: false,
    };

    const result = await bw.createItem(payload, 'token');
    expect(result.id).toBe('abc');
    expect(result.name).toBe('Test');

    expectEncodeAndExec(mockSpawn, 'token', 'create', ['item']);
  });
});

// ---------------------------------------------------------------------------
// editItem
// ---------------------------------------------------------------------------
describe('editItem', () => {
  it('encodes payload and edits item via bw encode + bw edit item', async () => {
    const encoded = Buffer.from(JSON.stringify({ name: 'Updated' })).toString('base64');
    spawnMockChild(encoded);
    spawnMockChild('');

    const payload = { name: 'Updated', notes: null };

    await bw.editItem('item-123', payload, 'token');

    expectEncodeAndExec(mockSpawn, 'token', 'edit', ['item', 'item-123']);
  });

  it('throws BwError on failure', async () => {
    spawnMockChild('Edit failed', 1);

    await expect(bw.editItem('item-123', { name: 'X' }, 'token')).rejects.toThrow('Edit failed');
  });
});

// ---------------------------------------------------------------------------
// createFolder
// ---------------------------------------------------------------------------
describe('createFolder', () => {
  it('encodes folder name and creates folder via bw encode + bw create folder', async () => {
    const folderJson = JSON.stringify({ id: 'f1', name: 'Work' });
    const encoded = Buffer.from(JSON.stringify({ name: 'Work' })).toString('base64');
    spawnMockChild(encoded);
    spawnMockChild(folderJson);

    const result = await bw.createFolder('Work', 'token');
    expect(result).toEqual({ id: 'f1', name: 'Work' });

    expectEncodeAndExec(mockSpawn, 'token', 'create', ['folder']);
  });
});

// ---------------------------------------------------------------------------
// lock
// ---------------------------------------------------------------------------
describe('lock', () => {
  it('calls bw lock with BW_SESSION', async () => {
    mockExec(mockExecFile, '');

    await bw.lock('token');
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['lock'], hasSession('token'));
  });

  it('does not throw on lock failure', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('already locked'));

    await expect(bw.lock('token')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
describe('status', () => {
  it('calls bw status and returns parsed result', async () => {
    const statusObj = {
      serverUrl: null,
      lastSync: null,
      userEmail: 'a@b.com',
      userId: 'x',
      status: 'unlocked' as const,
    };
    mockExec(mockExecFile, JSON.stringify(statusObj));

    const result = await bw.status();
    expect(result).toEqual(statusObj);
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['status'], expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// deleteItem
// ---------------------------------------------------------------------------
describe('deleteItem', () => {
  it('calls bw delete item with BW_SESSION', async () => {
    mockExec(mockExecFile, '');

    await bw.deleteItem('item-1', 'token');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['delete', 'item', 'item-1'],
      hasSession('token'),
    );
  });

  it('throws BwError on delete failure', async () => {
    mockExecError(mockExecFile, 'Item not found');

    await expect(bw.deleteItem('missing', 'token')).rejects.toThrow('Item not found');
  });
});

// ---------------------------------------------------------------------------
// generatePassword
// ---------------------------------------------------------------------------
describe('generatePassword', () => {
  it('calls bw generate with all flags enabled', async () => {
    mockExec(mockExecFile, 'aB3$xY9!pQ2&wE5!rT');

    const result = await bw.generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    });
    expect(result).toBe('aB3$xY9!pQ2&wE5!rT');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['generate', '-u', '-l', '-n', '-s', '--length', '20'],
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it('calls bw generate with subset of flags', async () => {
    mockExec(mockExecFile, 'abc123');

    await bw.generatePassword({
      length: 12,
      uppercase: false,
      lowercase: true,
      numbers: true,
      symbols: false,
    });
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['generate', '-l', '-n', '--length', '12'],
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it('throws BwError on failure', async () => {
    mockExecError(mockExecFile, 'CLI error');

    await expect(
      bw.generatePassword({
        length: 20,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      }),
    ).rejects.toThrow('CLI error');
  });
});

// ---------------------------------------------------------------------------
// getErrorMessage
// ---------------------------------------------------------------------------
describe('getErrorMessage', () => {
  it('filters deprecation warnings from stderr', () => {
    const err = new Error('Command failed') as { stderr: string } & Error;
    err.stderr =
      '[DEP001] DeprecationWarning: old api\nactual error\n[DEP002] DeprecationWarning: another';

    expect(bw.getErrorMessage(err)).toBe('actual error');
  });

  it('returns error message when stderr is all deprecation lines', () => {
    const err = new Error('Command failed') as { stderr: string } & Error;
    err.stderr = '[DEP001] DeprecationWarning: x\n[DEP002] DeprecationWarning: y';

    expect(bw.getErrorMessage(err)).toBe('Command failed');
  });

  it('returns error message when no stderr property', () => {
    const err = new Error('Something broke');

    expect(bw.getErrorMessage(err)).toBe('Something broke');
  });

  it('handles non-Error values', () => {
    expect(bw.getErrorMessage('plain string')).toBe('plain string');
    expect(bw.getErrorMessage(null)).toBe('null');
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
describe('logout', () => {
  it('calls bw logout', async () => {
    mockExec(mockExecFile, '');

    await bw.logout();
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['logout'], expect.any(Object));
  });

  it('returns silently when already logged out', async () => {
    mockExecError(mockExecFile, 'Not logged in.');

    await expect(bw.logout()).resolves.toBeUndefined();
  });

  it('throws BwError on other logout failures', async () => {
    mockExecError(mockExecFile, 'Network error');

    await expect(bw.logout()).rejects.toThrow('Network error');
  });
});

// ---------------------------------------------------------------------------
// NODE_EXTRA_CA_CERTS
// ---------------------------------------------------------------------------
describe('custom CA cert', () => {
  const params = {
    clientId: 'user.123',
    clientSecret: 'secret',
    serverUrl: 'https://bitwarden.com',
  };

  beforeEach(() => {
    mockPrefs.customCertPath = '';
  });

  async function loginAndCheckFirstCall(expectedEnv: ReturnType<typeof expect.objectContaining>) {
    mockExec(mockExecFile, '');
    mockExec(mockExecFile, '');
    await bw.login(params);
    expect(mockExecFile).toHaveBeenNthCalledWith(
      1,
      'bw',
      ['config', 'server', 'https://bitwarden.com'],
      expectedEnv,
    );
  }

  it('does not set NODE_EXTRA_CA_CERTS when customCertPath is empty', async () => {
    await loginAndCheckFirstCall(
      expect.objectContaining({
        env: expect.not.objectContaining({ NODE_EXTRA_CA_CERTS: expect.anything() }),
      }),
    );
  });

  it('sets NODE_EXTRA_CA_CERTS when customCertPath is configured', async () => {
    mockPrefs.customCertPath = '/etc/ssl/certs/custom-ca.pem';
    await loginAndCheckFirstCall(
      expect.objectContaining({
        env: expect.objectContaining({ NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/custom-ca.pem' }),
      }),
    );
  });

  it('sets NODE_EXTRA_CA_CERTS in sessionEnv calls', async () => {
    mockPrefs.customCertPath = '/etc/ssl/certs/custom-ca.pem';
    mockExec(mockExecFile, '');

    await bw.sync('token-abc');

    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['sync'],
      expect.objectContaining({
        env: expect.objectContaining({ NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/custom-ca.pem' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// listSends
// ---------------------------------------------------------------------------
describe('listSends', () => {
  it('calls bw send list with BW_SESSION and parses JSON', async () => {
    const sends = [{ id: 's1', name: 'My Send', type: 0, accessId: 'abc' }];
    mockExec(mockExecFile, JSON.stringify(sends));

    const result = await bw.listSends('token-abc');
    expect(result).toEqual(sends);
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['send', 'list'], hasSession('token-abc'));
  });

  it('throws BwError on failure', async () => {
    mockExecError(mockExecFile, 'CLI error');

    await expect(bw.listSends('token')).rejects.toThrow('CLI error');
  });
});

// ---------------------------------------------------------------------------
// getSend
// ---------------------------------------------------------------------------
describe('getSend', () => {
  it('calls bw send get with BW_SESSION and returns parsed send', async () => {
    const sendObj = { id: 's1', name: 'My Send', type: 0, accessId: 'abc' };
    mockExec(mockExecFile, JSON.stringify(sendObj));

    const result = await bw.getSend('s1', 'token');
    expect(result).toEqual(sendObj);
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['send', 'get', 's1'], hasSession('token'));
  });
});

// ---------------------------------------------------------------------------
// createSend
// ---------------------------------------------------------------------------
describe('createSend', () => {
  it('encodes payload and creates send via bw encode + bw send create', async () => {
    const encoded = Buffer.from(JSON.stringify({ name: 'Test Send' })).toString('base64');
    spawnMockChild(encoded);
    spawnMockChild(
      '{"id":"s1","name":"Test Send","type":0,"accessId":"abc","notes":null,"deletionDate":"","creationDate":"","revisionDate":"","disabled":false,"hideEmail":false,"password":null,"maxAccessCount":null,"accessCount":0,"text":null,"file":null,"expirationDate":null}',
    );

    const payload = {
      name: 'Test Send',
      notes: null,
      type: 0 as const,
      text: null,
      file: null,
      password: null,
      maxAccessCount: null,
      deletionDate: null,
      expirationDate: null,
      disabled: false,
      hideEmail: false,
    };

    const result = await bw.createSend(payload, 'token');
    expect(result.id).toBe('s1');
    expect(result.name).toBe('Test Send');

    expectEncodeAndExec(mockSpawn, 'token', 'send', ['create']);
  });
});

// ---------------------------------------------------------------------------
// editSend
// ---------------------------------------------------------------------------
describe('editSend', () => {
  it('encodes payload and edits send via bw encode + bw send edit', async () => {
    const encoded = Buffer.from(JSON.stringify({ name: 'Updated' })).toString('base64');
    spawnMockChild(encoded);
    spawnMockChild('');

    await bw.editSend('send-123', { name: 'Updated' }, 'token');

    expectEncodeAndExec(mockSpawn, 'token', 'send', ['edit', 'send-123']);
  });

  it('throws BwError on failure', async () => {
    spawnMockChild('Edit failed', 1);

    await expect(bw.editSend('send-123', { name: 'X' }, 'token')).rejects.toThrow('Edit failed');
  });
});

// ---------------------------------------------------------------------------
// deleteSend
// ---------------------------------------------------------------------------
describe('deleteSend', () => {
  it('calls bw send delete with BW_SESSION', async () => {
    mockExec(mockExecFile, '');

    await bw.deleteSend('send-1', 'token');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['send', 'delete', 'send-1'],
      hasSession('token'),
    );
  });

  it('throws BwError on delete failure', async () => {
    mockExecError(mockExecFile, 'Send not found');

    await expect(bw.deleteSend('missing', 'token')).rejects.toThrow('Send not found');
  });
});

// ---------------------------------------------------------------------------
// receiveSend
// ---------------------------------------------------------------------------
describe('receiveSend', () => {
  it('calls bw send receive and returns text for text sends', async () => {
    mockExec(mockExecFile, 'This is the send content\n');

    const result = await bw.receiveSend('https://vault.bitwarden.com/#/send/abc');
    expect(result.kind).toBe('text');
    expect(result.text).toBe('This is the send content');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['send', 'receive', 'https://vault.bitwarden.com/#/send/abc'],
      expect.objectContaining({ env: expect.any(Object) }),
    );
  });

  it('returns file result when output directory is provided', async () => {
    mockExec(mockExecFile, '/home/user/Downloads/file.pdf\n');

    const result = await bw.receiveSend(
      'https://vault.bitwarden.com/#/send/abc',
      undefined,
      '/tmp/Downloads',
    );
    expect(result.kind).toBe('file');
    expect(result.path).toBe('/home/user/Downloads/file.pdf');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['send', 'receive', 'https://vault.bitwarden.com/#/send/abc', '--output', '/tmp/Downloads'],
      expect.objectContaining({ env: expect.any(Object) }),
    );
  });

  it('throws BwError on failure', async () => {
    mockExecError(mockExecFile, 'Send not found');

    await expect(bw.receiveSend('https://example.com/bad')).rejects.toThrow('Send not found');
  });
});
