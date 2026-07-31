import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveYouTubeInput } from "../src/youtube";

const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function resolve(input: string) {
	const target = resolveYouTubeInput(input);
	assert.ok(target, `expected ${JSON.stringify(input)} to resolve`);
	return target;
}

describe("video links", () => {
	const equivalent = [
		WATCH,
		"https://youtu.be/dQw4w9WgXcQ",
		"https://m.youtube.com/watch?v=dQw4w9WgXcQ",
		"https://music.youtube.com/watch?v=dQw4w9WgXcQ",
		"https://www.youtube.com/shorts/dQw4w9WgXcQ",
		"https://www.youtube.com/live/dQw4w9WgXcQ",
		"https://www.youtube.com/embed/dQw4w9WgXcQ",
		"youtube.com/watch?v=dQw4w9WgXcQ",
		"dQw4w9WgXcQ",
		"  dQw4w9WgXcQ  ",
	];

	for (const input of equivalent) {
		it(`collapses ${input} to the canonical watch URL`, () => {
			assert.deepEqual(resolve(input), { kind: "video", url: WATCH });
		});
	}

	it("unwraps a freetube:// link pasted back in", () => {
		assert.deepEqual(resolve(`freetube://${WATCH}`), {
			kind: "video",
			url: WATCH,
		});
	});

	it("drops tracking parameters but keeps the timestamp", () => {
		assert.equal(
			resolve("https://youtu.be/dQw4w9WgXcQ?si=abcdef123456&t=42").url,
			`${WATCH}&t=42`,
		);
	});

	it("keeps playlist context on a watch URL", () => {
		assert.equal(
			resolve(`${WATCH}&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf&pp=junk`).url,
			`${WATCH}&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf`,
		);
	});
});

describe("channels", () => {
	it("resolves a bare handle", () => {
		assert.deepEqual(resolve("@LinusTechTips"), {
			kind: "channel",
			url: "https://www.youtube.com/@LinusTechTips",
		});
	});

	it("keeps channel sub-pages", () => {
		assert.equal(
			resolve("https://www.youtube.com/@LinusTechTips/videos").url,
			"https://www.youtube.com/@LinusTechTips/videos",
		);
	});

	it("resolves a bare UC channel ID", () => {
		assert.deepEqual(resolve("UCXuqSBlHAE6Xw-yeJA0Tunw"), {
			kind: "channel",
			url: "https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw",
		});
	});
});

describe("playlist ID prefixes", () => {
	// Open and Bookmarks used to ship separate parsers that recognised
	// different subsets of these, so each prefix is a regression test.
	const prefixes = [
		"PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
		"UUXuqSBlHAE6Xw-yeJA0Tunw",
		"LLXuqSBlHAE6Xw-yeJA0Tunw",
		"FLXuqSBlHAE6Xw-yeJA0Tunw",
		"RDMMdQw4w9WgXcQ1234",
		"ECXuqSBlHAE6Xw-yeJA0Tunw",
		"OLAK5uy_kZbEDNTFBSkbtGHOM1234567890abc",
	];

	for (const id of prefixes) {
		it(`resolves ${id.slice(0, 2)}… as a playlist`, () => {
			assert.deepEqual(resolve(id), {
				kind: "playlist",
				url: `https://www.youtube.com/playlist?list=${id}`,
			});
		});
	}

	it("resolves a playlist URL", () => {
		assert.deepEqual(
			resolve("https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgN"),
			{
				kind: "playlist",
				url: "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgN",
			},
		);
	});
});

describe("passthrough and rejection", () => {
	it("passes unrecognised YouTube pages through untouched", () => {
		assert.deepEqual(resolve("https://www.youtube.com/feed/subscriptions"), {
			kind: "other",
			url: "https://www.youtube.com/feed/subscriptions",
		});
	});

	const rejected = [
		"",
		"   ",
		"just a search phrase",
		"https://example.com/watch?v=dQw4w9WgXcQ",
		"https://notyoutube.com/@handle",
		"javascript:alert(1)",
		"https://www.youtube.com/watch?v=tooshort",
		"https://www.youtube.com/watch",
		"https://www.youtube.com/playlist",
	];

	for (const input of rejected) {
		it(`rejects ${JSON.stringify(input)}`, () => {
			assert.equal(resolveYouTubeInput(input), null);
		});
	}
});
