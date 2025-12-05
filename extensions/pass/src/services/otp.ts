import { Preferences } from "@/preferences";
import { runCommand } from "@/services/command";

export class OtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpError";
  }
}

export async function deriveOtpCode(uri: string, preferences: Preferences): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new OtpError("Invalid OTP URI");
  }

  const secret = parsed.searchParams.get("secret");
  if (!secret) {
    throw new OtpError("OTP entry is missing a secret");
  }

  const stdout = await runCommand("oathtool", ["-b", "--totp", secret], preferences);
  const value = stdout.trim();
  if (!value) {
    throw new OtpError("oathtool did not return a code");
  }
  return value;
}
