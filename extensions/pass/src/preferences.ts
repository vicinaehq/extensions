import { getPreferenceValues } from "@vicinae/api";
import { resolveAbsolutePath } from "@/utils/path";

type RawPreferences = {
  passwordStorePath?: string;
  gpgPassphrase?: string;
  additionalPath?: string;
  otpAfterPassword?: boolean;
  lastUsedTtl?: string;
  action?: "paste" | "copy";
};

export type Preferences = {
  passwordStorePath: string;
  gpgPassphrase?: string;
  additionalPath?: string;
  otpAfterPassword: boolean;
  lastUsedTtlSeconds: number;
  action: "paste" | "copy";
};

export function getPreferences(): Preferences {
  const raw = getPreferenceValues<RawPreferences>();
  const path = raw.passwordStorePath || "~/.password-store";
  return {
    passwordStorePath: resolveAbsolutePath(path),
    gpgPassphrase: sanitizeString(raw.gpgPassphrase),
    additionalPath: sanitizeString(raw.additionalPath),
    otpAfterPassword: raw.otpAfterPassword ?? true,
    lastUsedTtlSeconds: parsePositiveInt(raw.lastUsedTtl, 120),
    action: raw.action || "paste",
  };
}

function sanitizeString(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}
