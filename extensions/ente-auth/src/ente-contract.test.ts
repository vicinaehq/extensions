import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
	expandConfiguredPath,
	parseEnteAccounts,
	parseSecrets,
	parseSecretUrl,
	snapshotSecret,
} from "./ente-contract";

const validUrl =
	"otpauth://totp/user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30";

void test("parses a valid Ente otpauth URL", () => {
	const secret = parseSecretUrl(validUrl);
	assert.equal(secret?.username, "user@example.com");
	assert.equal(secret?.issuer, "GitHub");
	assert.equal(secret?.algorithm, "SHA1");
	assert.equal(secret?.digits, 6);
	assert.equal(secret?.period, 30);
	assert.equal(secret?.secret, "JBSWY3DPEHPK3PXP");
});

void test("reads tags and notes from Ente codeDisplay metadata", () => {
	const display = encodeURIComponent(
		JSON.stringify({
			tags: [" work ", "personal"],
			note: "https://github.com",
		}),
	);
	const secret = parseSecretUrl(`${validUrl}&codeDisplay=${display}`);
	assert.deepEqual(secret?.tags, ["work", "personal"]);
	assert.equal(secret?.notes, "https://github.com");
});

void test("skips trashed entries", () => {
	const display = encodeURIComponent(JSON.stringify({ trashed: true }));
	assert.equal(parseSecretUrl(`${validUrl}&codeDisplay=${display}`), null);
});

void test("skips malformed lines but keeps valid lines", () => {
	assert.equal(parseSecrets(["", "not-an-otpauth-url", validUrl]).length, 1);
});

void test("normalises formatting in the secret and broken HTML separators", () => {
	const url =
		"otpauth://totp/user@example.com?secret=JBSW-Y3D-PEHPK3PXP&amp%3Bissuer=GitHub&algorithm=SHA1&digits=6&period=30";
	assert.equal(parseSecretUrl(url)?.secret, "JBSWY3DPEHPK3PXP");
	assert.equal(parseSecretUrl(url)?.issuer, "GitHub");
});

void test("uses safe defaults for null OTP parameters", () => {
	const url =
		"otpauth://totp/user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=null&digits=null&period=null";
	const secret = parseSecretUrl(url);
	assert.equal(secret?.algorithm, "SHA1");
	assert.equal(secret?.digits, 6);
	assert.equal(secret?.period, 30);
});

void test("generates deterministic current and next codes", () => {
	const secret = parseSecretUrl(validUrl);
	if (!secret) throw new Error("test fixture did not parse");
	const snapshot = snapshotSecret(secret, 1_700_000_000_000);
	assert.equal(snapshot.current, "324550");
	assert.equal(snapshot.next, "367665");
	assert.equal(snapshot.remaining, 10);
});

void test("parses multiple Ente accounts and selects auth metadata", () => {
	const accounts = parseEnteAccounts(
		`Configured accounts: 2\n====================================\nEmail: one@example.com\nApp: auth\nExportDir: /home/one/ente\n====================================\nEmail: two@example.com\nApp: photos\nExportDir: /home/two/photos`,
	);
	assert.deepEqual(accounts, [
		{ email: "one@example.com", app: "auth", exportDir: "/home/one/ente" },
		{ email: "two@example.com", app: "photos", exportDir: "/home/two/photos" },
	]);
});

void test("expands a home-relative configured path", () => {
	assert.equal(
		expandConfiguredPath(" '~/Documents/ente' ", "/home/arduoi"),
		"/home/arduoi/Documents/ente",
	);
	assert.equal(
		expandConfiguredPath("/var/lib/ente", "/home/arduoi"),
		"/var/lib/ente",
	);
});
