import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockLoadTotpSecrets = vi.hoisted(() => vi.fn());

vi.mock('../vault-cache', () => ({
  loadTotpSecrets: mockLoadTotpSecrets,
}));

import { useTotpSecrets } from '../use-totp-secrets';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTotpSecrets', () => {
  it('returns an empty map initially and populates after load resolves', async () => {
    mockLoadTotpSecrets.mockResolvedValue({ a: 'SECRET1', b: 'SECRET2' });

    const { result } = renderHook(() => useTotpSecrets());

    expect(result.current).toEqual({});

    await waitFor(() => {
      expect(result.current).toEqual({ a: 'SECRET1', b: 'SECRET2' });
    });
    expect(mockLoadTotpSecrets).toHaveBeenCalledTimes(1);
  });

  it('returns an empty map when load resolves empty', async () => {
    mockLoadTotpSecrets.mockResolvedValue({});

    const { result } = renderHook(() => useTotpSecrets());

    await waitFor(() => {
      expect(mockLoadTotpSecrets).toHaveBeenCalled();
    });
    expect(result.current).toEqual({});
  });
});
