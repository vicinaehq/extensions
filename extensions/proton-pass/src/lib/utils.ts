import { Icon } from "@vicinae/api";
import { Item, ItemType, PasswordScore } from "./types";

export function getItemIcon(type: ItemType): Icon {
	switch (type) {
		case "login":
			return Icon.Person;
		case "note":
			return Icon.BlankDocument;
		case "credit_card":
			return Icon.CreditCard;
		case "identity":
			return Icon.PersonLines;
		case "alias":
			return Icon.AtSymbol;
		case "ssh_key":
			return Icon.Key;
		case "wifi":
			return Icon.Wifi;
		default:
			return Icon.BlankDocument;
	}
}

export function formatItemSubtitle(item: Item): string {
	const parts: string[] = [];

	if (item.vaultName) {
		parts.push(`in ${item.vaultName}`);
	}

	return parts.join(" • ");
}

export function maskPassword(password: string): string {
	return "•".repeat(password.length);
}

export function getTotpRemainingSeconds(): number {
	const now = Math.floor(Date.now() / 1000);
	const timeStep = 30;
	return timeStep - (now % timeStep);
}

export function formatTotpCode(code: string): string {
	if (code.length === 6) {
		return `${code.slice(0, 3)} ${code.slice(3)}`;
	}
	return code;
}

export function getPasswordStrengthLabel(passwordScore: string): string {
	return passwordScore;
}

export function getPasswordStrengthIcon(passwordScore: string): Icon {
	const normalized = passwordScore.trim().toLowerCase();

	if (
		normalized === "strong" ||
		normalized === "secure" ||
		normalized === "good"
	) {
		return Icon.CheckCircle;
	}

	if (
		normalized === "fair" ||
		normalized === "average" ||
		normalized === "moderate"
	) {
		return Icon.Exclamationmark;
	}

	if (
		normalized === "weak" ||
		normalized === "too weak" ||
		normalized === "vulnerable"
	) {
		return Icon.XMarkCircle;
	}

	return Icon.QuestionMarkCircle;
}

// Local heuristic scorer instead of `pass-cli password score` so that
// passwords never cross process boundaries as command-line arguments.
export function scorePassword(password: string): PasswordScore {
	const penalties: string[] = [];

	if (password.length < 12) penalties.push("Use at least 12 characters");
	if (!/[a-z]/.test(password)) penalties.push("Add lowercase letters");
	if (!/[A-Z]/.test(password)) penalties.push("Add uppercase letters");
	if (!/[0-9]/.test(password)) penalties.push("Add numbers");
	if (!/[^a-zA-Z0-9]/.test(password)) penalties.push("Add symbols");
	if (/(.)\1{2,}/.test(password)) penalties.push("Avoid repeated characters");
	if (/(?:password|letmein|welcome|admin|qwerty|123456)/i.test(password))
		penalties.push("Avoid common patterns");
	if (/(?:0123|1234|2345|abcd|qwer|asdf|zxcv)/i.test(password))
		penalties.push("Avoid sequences");

	let characterPool = 0;
	if (/[a-z]/.test(password)) characterPool += 26;
	if (/[A-Z]/.test(password)) characterPool += 26;
	if (/[0-9]/.test(password)) characterPool += 10;
	if (/[^a-zA-Z0-9]/.test(password)) characterPool += 33;

	const entropy =
		characterPool > 0 ? Math.log2(characterPool) * password.length : 0;
	const penaltyWeight = 7;
	const rawScore =
		Math.round(Math.min(100, entropy * 1.2)) - penalties.length * penaltyWeight;
	const numericScore = Math.max(0, Math.min(100, rawScore));

	let passwordScore = "Weak";
	if (numericScore >= 80) {
		passwordScore = "Strong";
	} else if (numericScore >= 60) {
		passwordScore = "Good";
	} else if (numericScore >= 35) {
		passwordScore = "Fair";
	}

	return {
		numericScore,
		passwordScore,
		penalties: penalties.length > 0 ? penalties : undefined,
	};
}
