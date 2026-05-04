import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockRemoveItem, mockShowToast, mockBw } = vi.hoisted(() => ({
  mockBw: {
    logout: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    lock: vi.fn(),
    sync: vi.fn(),
    unlock: vi.fn(),
    login: vi.fn(),
    getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  },
  mockRemoveItem: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
  mockShowToast: vi.fn(),
}));

vi.mock('../bw-executor', () => mockBw);

vi.mock('@vicinae/api', () => ({
  LocalStorage: { removeItem: mockRemoveItem },
  showToast: mockShowToast,
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
}));

import Logout from '../logout';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Logout', () => {
  it('calls bw.logout, clears storage, and shows success toast', async () => {
    await Logout();

    expect(mockBw.logout).toHaveBeenCalledOnce();
    expect(mockRemoveItem).toHaveBeenCalledWith('vicinae-bitwarden-session');
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

  it('shows failure toast with non-Error rejections', async () => {
    mockBw.logout.mockRejectedValueOnce('something broke');

    await Logout();

    expect(mockShowToast).toHaveBeenCalledWith({
      style: 'failure',
      title: 'Logout failed',
      message: 'something broke',
    });
  });
});
