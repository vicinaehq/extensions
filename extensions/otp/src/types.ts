export type OTPType = "totp" | "hotp";

export interface OTPAccount {
	name: string;
	secret: string;
	type: OTPType;
	counter?: number; // Only for HOTP
	issuer?: string;
	digits?: number;
	period?: number; // Only for TOTP
	algorithm?: string;
}

export interface ParsedOTPUrl {
	type: OTPType;
	label: string;
	issuer?: string;
	secret: string;
	digits?: number;
	period?: number; // TOTP only
	counter?: number; // HOTP only
	algorithm?: string;
}

export interface RawOTPAccount {
	name: string;
	secret: string;
	type: string;
	counter?: number;
	issuer?: string;
	digits?: number;
	period?: number;
	algorithm?: string;
}

export interface OTPItem {
	name: string;
	code: string;
	type: OTPType;
	timeLeft?: number;
	counter?: number;
}