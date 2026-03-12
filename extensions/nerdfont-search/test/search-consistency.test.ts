// @ts-nocheck

const assert = require("node:assert/strict");
const test = require("node:test");
const Fuse = require("fuse.js");
const fuseOptions = require("../src/fuse-options.json");

const indexData = require("./fixtures/icon-index.fixture.json");

const decodedIndex = indexData.icons.map((icon) => ({
	...icon,
	searchTokens: icon.searchTokens.map((idx) => indexData.dictionary[idx]),
}));

const fuse = new Fuse(decodedIndex, fuseOptions);

function topTen(searchTerm) {
	return fuse
		.search(searchTerm)
		.slice(0, 10)
		.map((result) => ({
			displayName: result.item.displayName,
			id: result.item.id,
			score: result.score?.toFixed(6) || "N/A",
		}));
}

test("search results are deterministic across repeated runs", async (t) => {
	const terms = ["cat", "arrow", "home", "search", "file"];

	for (const term of terms) {
		await t.test(`term: ${term}`, () => {
			const baseline = topTen(term);

			for (let i = 0; i < 4; i += 1) {
				assert.deepEqual(topTen(term), baseline);
			}
		});
	}
});
