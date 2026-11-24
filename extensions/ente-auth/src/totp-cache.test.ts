import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { EnteSecret, TotpSnapshot } from "./ente-contract";
import { createSnapshotCache } from "./totp-cache";

const secret: EnteSecret = {
	username: "person@example.com",
	issuer: "Example",
	algorithm: "SHA1",
	digits: 6,
	period: 30,
	tags: [],
	notes: "",
	secret: "JBSWY3DPEHPK3PXP",
};

void test("caches generated codes for a full period while the countdown updates", () => {
	const calls: number[] = [];
	const cached = createSnapshotCache((account, timestamp) => {
		calls.push(timestamp);
		return {
			...account,
			serviceName: account.issuer,
			current: String(timestamp),
			next: String(timestamp + account.period * 1000),
			remaining: account.period,
		};
	});

	const initial = cached(secret, 0);
	assert.equal(initial.current, "0");
	assert.equal(cached(secret, 0), initial);
	assert.deepEqual(cached(secret, 14_000), { ...initial, remaining: 16 });
	assert.deepEqual(cached(secret, 29_999), { ...initial, remaining: 1 });
	assert.deepEqual(calls, [0]);

	assert.equal(cached(secret, 30_000).current, "30000");
	assert.equal(cached(secret, 30_000).remaining, 30);
	assert.deepEqual(calls, [0, 30_000]);
});

void test("isolates accounts, respects custom periods and clock corrections", () => {
	let calls = 0;
	const cached = createSnapshotCache((account, timestamp): TotpSnapshot => {
		calls += 1;
		return {
			...account,
			serviceName: account.issuer,
			current: String(timestamp),
			next: "next",
			remaining: account.period,
		};
	});

	const longer = { ...secret, period: 45 };
	const duplicate = { ...secret };
	cached(secret, 15_000);
	cached(longer, 15_000);
	cached(duplicate, 15_000);
	assert.equal(calls, 3);
	assert.equal(cached(longer, 30_000).remaining, 15);
	assert.equal(calls, 3);
	cached(longer, 45_000);
	cached(secret, 31_000);
	cached(secret, 0);
	assert.equal(calls, 6);
});

void test("large account lists only regenerate on a TOTP boundary", () => {
	let generations = 0;
	const accounts = Array.from({ length: 150 }, (_, index) => ({
		...secret,
		username: `person${index}@example.com`,
	}));
	const cached = createSnapshotCache((account, timestamp) => {
		generations += 1;
		return {
			...account,
			serviceName: account.issuer,
			current: String(timestamp),
			next: "next",
			remaining: account.period,
		};
	});

	for (let seconds = 0; seconds < 60; seconds += 1) {
		for (const account of accounts) cached(account, seconds * 1000);
	}
	assert.equal(generations, 300);
});
