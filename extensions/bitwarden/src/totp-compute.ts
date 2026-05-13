import * as OTPAuth from 'otpauth';

export function isSteamSecret(secret: string | null | undefined): boolean {
  return !!secret && secret.startsWith('steam://');
}

export interface LocalTotp {
  code: string;
  remainingMs: number;
  periodSec: number;
}

export function computeLocalTotp(secret: string, timestamp: number): LocalTotp | null {
  if (!secret || isSteamSecret(secret)) return null;
  try {
    const totp = secret.startsWith('otpauth://')
      ? (OTPAuth.URI.parse(secret) as OTPAuth.TOTP)
      : new OTPAuth.TOTP({ secret: normalizeBase32(secret) });
    return {
      code: totp.generate({ timestamp }),
      remainingMs: totp.remaining({ timestamp }),
      periodSec: totp.period,
    };
  } catch {
    return null;
  }
}

function normalizeBase32(secret: string): string {
  return secret.replace(/[\s-]/g, '').toUpperCase();
}
