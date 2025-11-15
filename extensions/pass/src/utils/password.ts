import { Preferences } from "@/preferences";
import { deriveOtpCode, OtpError } from "@/services/otp";
import { PasswordOption, PasswordOptionsResult } from "@/types";

type BuildPasswordOptionsArgs = {
  plaintext: string;
  preferences: Preferences;
  prioritizeOtp: boolean;
};

export async function buildPasswordOptions({
  plaintext,
  preferences,
  prioritizeOtp,
}: BuildPasswordOptionsArgs): Promise<PasswordOptionsResult> {
  const normalized = plaintext.replace(/\r\n/g, "\n");
  const chunks = normalized.split("\n");

  const options: PasswordOption[] = [];
  const warnings: string[] = [];

  if (chunks.length > 0) {
    const passwordValue = chunks.shift();
    if (passwordValue && passwordValue.trim().length > 0) {
      options.push({
        title: "Password",
        value: passwordValue,
        type: "password",
      });
    }
  }

  for (const rawLine of chunks) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("otpauth://")) {
      try {
        const code = await deriveOtpCode(line, preferences);
        const index = prioritizeOtp ? 0 : Math.min(1, options.length);
        options.splice(index, 0, {
          title: "OTP",
          value: code,
          type: "otp",
        });
      } catch (error) {
        const message =
          error instanceof OtpError
            ? error.message
            : "Failed to generate OTP code";
        warnings.push(message);
      }
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key || !value) continue;

    options.push({
      title: key,
      value,
      type: "field",
    });
  }

  return { options, warnings };
}
