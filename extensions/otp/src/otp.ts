import { authenticator, hotp } from "otplib";
import type { OTPType, OTPAccount, ParsedOTPUrl } from "./types";

export function generateOTP(account: OTPAccount): string {
	if (account.type === "hotp") {
		if (account.counter === undefined) {
			throw new Error("Counter is required for HOTP");
		}
		return hotp.generate(account.secret, account.counter);
	} else {
		return authenticator.generate(account.secret);
	}
}

export function incrementHOTPCounter(account: OTPAccount): OTPAccount {
	if (account.type === "hotp" && account.counter !== undefined) {
		return {
			...account,
			counter: account.counter + 1,
		};
	}
	return account;
}

export function parseOTPUrl(url: string): ParsedOTPUrl | null {
	try {
		const urlObj = new URL(url);

		if (urlObj.protocol !== "otpauth:") {
			return null;
		}

		const type = urlObj.host as OTPType; // 'totp' or 'hotp'
		if (type !== "totp" && type !== "hotp") {
			return null;
		}

		// Parse the label (pathname starts with /)
		const label = decodeURIComponent(urlObj.pathname.slice(1));
		let accountName = label;
		let issuer: string | undefined;

		// Check if label contains issuer (format: Issuer:Label)
		const colonIndex = label.indexOf(":");
		if (colonIndex !== -1) {
			issuer = label.slice(0, colonIndex);
			accountName = label.slice(colonIndex + 1);
		}

		// Parse query parameters
		const params = new URLSearchParams(urlObj.search);
		const secret = params.get("secret");
		const issuerParam = params.get("issuer");
		const digitsParam = params.get("digits");
		const periodParam = params.get("period");
		const counterParam = params.get("counter");
		const algorithm = params.get("algorithm") || undefined;

		const digits = digitsParam ? parseInt(digitsParam, 10) : undefined;
		const period = periodParam ? parseInt(periodParam, 10) : undefined;
		const counter = counterParam ? parseInt(counterParam, 10) : undefined;

		if (!secret) {
			return null;
		}

		// Use issuer from parameter if available and not already set
		if (issuerParam && !issuer) {
			issuer = issuerParam;
		}

		return {
			type,
			label: accountName,
			issuer,
			secret,
			digits,
			period: type === "totp" ? period : undefined,
			counter: type === "hotp" ? counter : undefined,
			algorithm,
		};
	} catch {
		return null;
	}
}

export function createOTPAccountFromUrl(url: string): OTPAccount | null {
	const parsed = parseOTPUrl(url);
	if (!parsed) {
		return null;
	}

	return {
		name: parsed.issuer ? `${parsed.issuer}: ${parsed.label}` : parsed.label,
		secret: parsed.secret,
		type: parsed.type,
		counter: parsed.counter,
		issuer: parsed.issuer,
		digits: parsed.digits,
		period: parsed.period,
		algorithm: parsed.algorithm,
	};
}

export function createOTPUrl(account: OTPAccount): string {
	const url = new URL(
		`otpauth://${account.type}/${encodeURIComponent(account.name)}`,
	);

	url.searchParams.set("secret", account.secret);

	if (account.issuer) {
		url.searchParams.set("issuer", account.issuer);
	}

	if (account.digits && account.digits !== 6) {
		url.searchParams.set("digits", account.digits.toString());
	}

	if (account.type === "totp" && account.period && account.period !== 30) {
		url.searchParams.set("period", account.period.toString());
	}

	if (account.type === "hotp" && account.counter !== undefined) {
		url.searchParams.set("counter", account.counter.toString());
	}

	if (account.algorithm && account.algorithm !== "SHA1") {
		url.searchParams.set("algorithm", account.algorithm);
	}

	return url.toString();
}
