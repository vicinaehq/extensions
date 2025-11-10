import { LocalStorage } from "@vicinae/api";
import type { OTPAccount, RawOTPAccount } from "./types";

const STORAGE_KEY = "2fa-otp-accounts";

export async function storeOTPAccount(account: OTPAccount): Promise<void> {
	try {
		const accounts = await getAllOTPAccounts();
		const existingIndex = accounts.findIndex(
			(acc) => acc.name === account.name,
		);

		if (existingIndex >= 0) {
			accounts[existingIndex] = account;
		} else {
			accounts.push(account);
		}

		await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
	} catch (error) {
		throw new Error(
			`Failed to store OTP account: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export async function getOTPAccount(
	accountName: string,
): Promise<OTPAccount | null> {
	try {
		const accounts = await getAllOTPAccounts();
		return accounts.find((acc) => acc.name === accountName) || null;
	} catch (_error) {
		return null;
	}
}

export async function listOTPAccounts(): Promise<string[]> {
	try {
		const accounts = await getAllOTPAccounts();
		return accounts.map((acc) => acc.name);
	} catch (_error) {
		return [];
	}
}

export async function updateOTPAccount(account: OTPAccount): Promise<void> {
	await storeOTPAccount(account);
}

export async function deleteOTPAccount(accountName: string): Promise<void> {
	try {
		const accounts = await getAllOTPAccounts();
		const filteredAccounts = accounts.filter((acc) => acc.name !== accountName);
		await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(filteredAccounts));
	} catch (error) {
		throw new Error(
			`Failed to delete OTP account: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export async function checkSecretToolAvailable(): Promise<boolean> {
	// Vicinae LocalStorage is always available
	return true;
}

async function getAllOTPAccounts(): Promise<OTPAccount[]> {
	try {
		const data = await LocalStorage.getItem(STORAGE_KEY);
		if (!data || typeof data !== "string") {
			return [];
		}

		const accounts = JSON.parse(data);
		// Validate the data structure
		if (!Array.isArray(accounts)) return [];

		return accounts.filter(
			(acc: RawOTPAccount) =>
				acc &&
				typeof acc.name === "string" &&
				typeof acc.secret === "string" &&
				(acc.type === "totp" || acc.type === "hotp"),
		);
	} catch (error) {
		console.warn("Failed to parse stored accounts:", error);
		return [];
	}
}
