import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockBw,
  mockDeleteSession,
  mockShowToast,
  mockClearCachedVault,
  mockClearCachedSends,
  mockClearTotpSecrets,
  mockClearSendKeys,
} = vi.hoisted(() => ({
  mockBw: {
    logout: vi.fn().mockResolvedValue(undefined),
    lock: vi.fn(),
    sync: vi.fn(),
    unlock: vi.fn(),
    login: vi.fn(),
    getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  },
  mockDeleteSession: vi.fn().mockResolvedValue(undefined),
  mockShowToast: vi.fn(),
  mockClearCachedVault: vi.fn().mockResolvedValue(undefined),
  mockClearCachedSends: vi.fn().mockResolvedValue(undefined),
  mockClearTotpSecrets: vi.fn().mockResolvedValue(undefined),
  mockClearSendKeys: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../bw-executor', () => mockBw);

vi.mock('../session-store', () => ({
  deleteSession: mockDeleteSession,
}));

vi.mock('@vicinae/api', () => ({
  showToast: mockShowToast,
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
}));

vi.mock('../vault-cache', () => ({
  clearCachedVault: mockClearCachedVault,
  clearCachedSends: mockClearCachedSends,
  clearTotpSecrets: mockClearTotpSecrets,
  clearSendKeys: mockClearSendKeys,
}));

import Logout from '../logout';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Logout', () => {
  it('calls bw.logout, clears session, clears cached vault and sends, and shows success toast', async () => {
    await Logout();

    expect(mockBw.logout).toHaveBeenCalledOnce();
    expect(mockDeleteSession).toHaveBeenCalledOnce();
    expect(mockClearCachedVault).toHaveBeenCalledOnce();
    expect(mockClearCachedSends).toHaveBeenCalledOnce();
    expect(mockClearTotpSecrets).toHaveBeenCalledOnce();
    expect(mockClearSendKeys).toHaveBeenCalledOnce();
    expect(mockShowToast).toHaveBeenCalledWith({
      style: 'success',
      title: 'Logged out',
      message: 'Your Bitwarden session has been cleared',
    });
  });

  it('shows failure toast when bw.logout throws', async () => {
    mockBw.logout.mockRejectedValueOnce(new Error('Network error'));

    await Logout();

    expect(mockShowToast).toHaveBeenCalledWith({
      style: 'failure',
      title: 'Logout failed',
      message: 'Network error',
    });
  });
});
