import { authenticator, hotp } from "otplib";
import type { OTPType } from "./types";

export function validateOTPSecret(
	secret: string,
	type: OTPType = "totp",
): boolean {
	try {
		if (type === "hotp") {
			hotp.generate(secret, 0);
		} else {
			authenticator.generate(secret);
		}
		return true;
	} catch {
		return false;
	}
}

export function formatOTPCode(code: string): string {
	if (code.length === 6) {
		return `${code.slice(0, 3)} ${code.slice(3)}`;
	}
	return code;
}

export function getTimeLeftForTOTP(): number {
	return 30 - (Math.floor(Date.now() / 1000) % 30);
}

export async function showErrorToast(
	showToast: (options: { title: string; message: string }) => Promise<unknown>,
	title: string,
	error: unknown,
): Promise<void> {
	await showToast({
		title,
		message: error instanceof Error ? error.message : String(error),
	});
}