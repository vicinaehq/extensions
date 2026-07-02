import { describe, expect, it } from 'vitest';
import { computeLocalTotp, isSteamSecret } from '../totp-compute';

describe('isSteamSecret', () => {
  it('returns true for steam:// secrets', () => {
    expect(isSteamSecret('steam://ABCDEF')).toBe(true);
  });

  it('returns false for plain base32, otpauth URIs, null, and empty', () => {
    expect(isSteamSecret('JBSWY3DPEHPK3PXP')).toBe(false);
    expect(isSteamSecret('otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP')).toBe(false);
    expect(isSteamSecret(null)).toBe(false);
    expect(isSteamSecret(undefined)).toBe(false);
    expect(isSteamSecret('')).toBe(false);
  });
});

describe('computeLocalTotp', () => {
  // RFC 6238 test vector: secret "12345678901234567890" (base32) = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
  // At T = 59 (Unix seconds), expected TOTP = "94287082" (8 digits, SHA-1).
  // With 6 digits (default), code is "287082".
  const rfcSecretBase32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('returns null for empty secret', () => {
    expect(computeLocalTotp('', 0)).toBeNull();
  });

  it('returns null for steam secrets', () => {
    expect(computeLocalTotp('steam://ABC', Date.now())).toBeNull();
  });

  it('computes RFC 6238 test vector at T=59 and reports remaining time + period', () => {
    const result = computeLocalTotp(rfcSecretBase32, 59_000);
    expect(result?.code).toBe('287082');
    expect(result?.periodSec).toBe(30);
    expect(result?.remainingMs).toBe(1_000);
  });

  it('parses otpauth:// URI and computes code', () => {
    const uri = `otpauth://totp/Example?secret=${rfcSecretBase32}&period=60&digits=6&algorithm=SHA1`;
    const result = computeLocalTotp(uri, 59_000);
    expect(result?.code).toBeDefined();
    expect(result?.periodSec).toBe(60);
  });

  it('returns null for unparseable secret', () => {
    expect(computeLocalTotp('not a base32 !@#', Date.now())).toBeNull();
  });
});
