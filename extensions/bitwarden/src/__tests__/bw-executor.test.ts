import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as bw from '../bw-executor';

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => {
  return {
    default: { execFile: mockExecFile },
    execFile: mockExecFile,
  };
});

vi.mock('node:util', () => {
  return {
    default: { promisify: (fn: unknown) => fn },
    promisify: (fn: unknown) => fn,
  };
});

function mockExec(stdout: string, stderr = '') {
  mockExecFile.mockResolvedValueOnce({ stdout, stderr });
}

function mockExecError(message: string, stderr = '') {
  const err = new Error(message) as Error & { stderr: string; code: number };
  err.stderr = stderr;
  err.code = 1;
  mockExecFile.mockRejectedValueOnce(err);
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
    mockExec('Bitwarden CLI v2024.1.0');
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
    mockExec('');
    mockExec('');

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
    mockExecError('Network error');

    await expect(bw.login(params)).rejects.toThrow('Network error');
  });
});

// ---------------------------------------------------------------------------
// unlock
// ---------------------------------------------------------------------------
describe('unlock', () => {
  it('calls bw unlock <password> --raw and returns session', async () => {
    mockExec('session-token-abc\n');

    const sessionToken = await bw.unlock('mypassword');
    expect(sessionToken).toBe('session-token-abc');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['unlock', 'mypassword', '--raw'],
      expect.any(Object),
    );
  });

  it('throws BwError with INVALID_PASSWORD for invalid password', async () => {
    mockExecError('Invalid master password');

    await expect(bw.unlock('wrong')).rejects.toMatchObject({
      message: 'Invalid master password',
      code: 'INVALID_PASSWORD',
    });
  });

  it('throws generic BwError for other unlock errors', async () => {
    mockExecError('Network timeout');

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
    mockExec('');

    await bw.sync('token-abc');
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['sync'], hasSession('token-abc'));
  });

  it('throws BwError on sync failure', async () => {
    mockExecError('Sync failed');

    await expect(bw.sync('token')).rejects.toThrow('Sync failed');
  });
});

// ---------------------------------------------------------------------------
// listItems
// ---------------------------------------------------------------------------
describe('listItems', () => {
  it('calls bw list items with BW_SESSION and parses JSON', async () => {
    const items = [{ id: '1', name: 'GitHub', type: 1 }];
    mockExec(JSON.stringify(items));

    const result = await bw.listItems('token-abc');
    expect(result).toEqual(items);
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['list', 'items'], hasSession('token-abc'));
  });

  it('throws BwError when JSON parsing fails', async () => {
    mockExec('not valid json {{{');

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
    mockExec(JSON.stringify(folders));

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
    mockExec(JSON.stringify(itemObj));

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
    mockExec('123456\n');

    const code = await bw.getTotp('1', 'token');
    expect(code).toBe('123456');
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['get', 'totp', '1'], hasSession('token'));
  });
});

// ---------------------------------------------------------------------------
// createItem
// ---------------------------------------------------------------------------
describe('createItem', () => {
  it('calls bw create item with BW_SESSION', async () => {
    mockExec('');
    const payload = {
      type: 1 as const,
      name: 'Test',
      notes: null,
      folderId: null,
      favorite: false,
    };

    await bw.createItem(payload, 'token');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['create', 'item', JSON.stringify(payload)],
      hasSession('token'),
    );
  });
});

// ---------------------------------------------------------------------------
// editItem
// ---------------------------------------------------------------------------
describe('editItem', () => {
  it('calls bw edit item with BW_SESSION', async () => {
    mockExec('');
    const payload = { name: 'Updated', notes: null };

    await bw.editItem('item-123', payload, 'token');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['edit', 'item', 'item-123', JSON.stringify(payload)],
      hasSession('token'),
    );
  });

  it('throws BwError on failure', async () => {
    mockExecError('Edit failed');

    await expect(bw.editItem('item-123', { name: 'X' }, 'token')).rejects.toThrow('Edit failed');
  });
});

// ---------------------------------------------------------------------------
// lock
// ---------------------------------------------------------------------------
describe('lock', () => {
  it('calls bw lock with BW_SESSION', async () => {
    mockExec('');

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
    mockExec(JSON.stringify(statusObj));

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
    mockExec('');

    await bw.deleteItem('item-1', 'token');
    expect(mockExecFile).toHaveBeenCalledWith(
      'bw',
      ['delete', 'item', 'item-1'],
      hasSession('token'),
    );
  });

  it('throws BwError on delete failure', async () => {
    mockExecError('Item not found');

    await expect(bw.deleteItem('missing', 'token')).rejects.toThrow('Item not found');
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
describe('logout', () => {
  it('calls bw logout', async () => {
    mockExec('');

    await bw.logout();
    expect(mockExecFile).toHaveBeenCalledWith('bw', ['logout'], expect.any(Object));
  });

  it('throws BwError on logout failure', async () => {
    mockExecError('Network error');

    await expect(bw.logout()).rejects.toThrow('Network error');
  });
});

// ---------------------------------------------------------------------------
// generatePassword
// ---------------------------------------------------------------------------
describe('generatePassword', () => {
  it('calls bw generate with all flags enabled', async () => {
    mockExec('aB3$xY9!pQ2&wE5!rT');

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
    mockExec('abc123');

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
    mockExecError('CLI error');

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
